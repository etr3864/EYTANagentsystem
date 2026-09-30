"""Create and move campaigns. Sending lives in deliver.py."""
from datetime import datetime

from sqlalchemy.orm import Session

from backend.models.agent import Agent
from backend.models.campaign import Campaign, CampaignRecipient, CampaignSend, CampaignStep
from backend.services.campaigns import constants as C
from backend.services.campaigns.queue import enqueue_step
from backend.services.campaigns.status import pause_agent
from backend.services.channels.agent_channels import get_channel_by_type


def create(db: Session, agent_id: int, name: str) -> Campaign:
    campaign = Campaign(agent_id=agent_id, name=name.strip()[:120], status=C.DRAFT)
    db.add(campaign)
    db.flush()
    db.add(CampaignStep(campaign_id=campaign.id, position=1, delay_minutes=0))
    return campaign


def paused_by_flag(db: Session, agent_id: int) -> list[Campaign]:
    return (
        db.query(Campaign)
        .filter(Campaign.agent_id == agent_id, Campaign.pause_reason == C.PAUSE_FLAG, Campaign.status == C.PAUSED)
        .order_by(Campaign.id)
        .all()
    )


def set_enabled(db: Session, agent: Agent, enabled: bool, resume: bool) -> list[int]:
    agent.campaigns_enabled = enabled
    if not enabled:
        pause_agent(db, agent.id, C.PAUSE_FLAG)
        return []
    waiting = paused_by_flag(db, agent.id)
    if resume:
        for campaign in waiting:
            campaign.status = C.RUNNING
            campaign.pause_reason = None
    return [campaign.id for campaign in waiting]


def pause(db: Session, campaign: Campaign) -> None:
    if campaign.status != C.RUNNING:
        return
    campaign.status = C.PAUSED
    campaign.pause_reason = C.PAUSE_MANUAL


def set_caps(agent: Agent, hourly: int, daily: int) -> None:
    if not 1 <= hourly <= 2000 or not 1 <= daily <= 50000:
        raise ValueError("caps")
    agent.campaign_hourly_cap = hourly
    agent.campaign_daily_cap = daily


def resume(db: Session, campaign: Campaign) -> None:
    channel = get_channel_by_type(db, campaign.agent_id, "whatsapp_wasender")
    if channel is None or (channel.health_status or "") != "connected":
        raise ValueError("session")
    if campaign.status != C.PAUSED:
        return
    campaign.status = C.RUNNING
    campaign.pause_reason = None


def start(db: Session, campaign: Campaign, agent: Agent, starts_at: datetime | None = None) -> None:
    if campaign.status != C.DRAFT:
        raise ValueError("not_draft")
    if not agent.campaigns_enabled:
        raise ValueError("flag")
    if not agent.campaign_hourly_cap or not agent.campaign_daily_cap:
        raise ValueError("caps")
    channel = get_channel_by_type(db, agent.id, "whatsapp_wasender")
    if channel is None or (channel.health_status or "") != "connected":
        raise ValueError("session")
    if not campaign.recipient_count:
        raise ValueError("audience")
    now = datetime.utcnow()
    later = bool(starts_at and starts_at > now)
    enqueue_step(db, campaign, 1, starts_at if later else now)
    campaign.starts_at = starts_at if later else None
    campaign.status = C.SCHEDULED if later else C.RUNNING
    campaign.current_step = 1
    campaign.step_sent_count = 0


def finish(db: Session, campaign: Campaign) -> None:
    if campaign.status not in (C.RUNNING, C.PAUSED, C.SCHEDULED):
        raise ValueError("not_open")
    campaign.status = C.FINISHED
    campaign.pause_reason = None


def erase(db: Session, campaign: Campaign) -> None:
    if campaign.status != C.FINISHED:
        raise ValueError("not_finished")
    if campaign.media_key:
        from backend.core.logger import log_error
        from backend.services.media.storage import delete_file
        try:
            delete_file(campaign.media_key)
        except Exception as error:
            log_error("campaign", str(error)[:80])
    db.delete(campaign)


def retry_failed(db: Session, campaign: Campaign) -> int:
    rows = (
        db.query(CampaignSend)
        .filter(
            CampaignSend.campaign_id == campaign.id,
            (
                (CampaignSend.status == C.FAILED)
                & (CampaignSend.attempt_count < 2)
                & CampaignSend.fail_reason.notin_(("session", "lease", "channel"))
            )
            | ((CampaignSend.status == C.UNCERTAIN) & (CampaignSend.fail_reason == "lease")),
        )
        .all()
    )
    now = datetime.utcnow()
    for send in rows:
        send.status = C.PENDING
        send.next_send_at = now
        send.fail_reason = None
        send.locked_until = None
    return len(rows)


def retry_chosen(db: Session, campaign: Campaign, phones: list[str]) -> int:
    if campaign.status not in (C.RUNNING, C.PAUSED):
        raise ValueError("locked")
    wanted = list(dict.fromkeys(phone for phone in phones if phone))[:50]
    if not wanted:
        raise ValueError("phones")
    rows = (
        db.query(CampaignSend)
        .join(CampaignRecipient, CampaignRecipient.id == CampaignSend.recipient_id)
        .filter(
            CampaignSend.campaign_id == campaign.id,
            CampaignSend.step_position == campaign.current_step,
            CampaignSend.status.in_((C.UNCERTAIN, C.FAILED)),
            CampaignRecipient.phone.in_(wanted),
        )
        .all()
    )
    now = datetime.utcnow()
    for send in rows:
        send.status = C.PENDING
        send.next_send_at = now
        send.fail_reason = None
        send.locked_until = None
    return len(rows)


def replace_steps(db: Session, campaign: Campaign, steps: list[dict]) -> None:
    if len(steps) > C.MAX_STEPS or not steps:
        raise ValueError("steps")
    db.query(CampaignStep).filter(CampaignStep.campaign_id == campaign.id).delete()
    for index, step in enumerate(steps, start=1):
        db.add(CampaignStep(
            campaign_id=campaign.id,
            position=index,
            delay_minutes=max(0, int(step.get("delay_minutes") or 0)),
            template_body=step.get("template_body"),
            prompt=step.get("prompt"),
        ))


def duplicate_phones(db: Session, campaign: Campaign) -> list[str]:
    others = (
        db.query(CampaignRecipient.phone)
        .join(Campaign, Campaign.id == CampaignRecipient.campaign_id)
        .filter(
            Campaign.agent_id == campaign.agent_id,
            Campaign.id != campaign.id,
            Campaign.status.in_((C.RUNNING, C.PAUSED)),
            CampaignRecipient.phone.in_(
                db.query(CampaignRecipient.phone).filter(CampaignRecipient.campaign_id == campaign.id)
            ),
        )
        .all()
    )
    return [row[0] for row in others]


def drop_duplicates(db: Session, campaign: Campaign) -> int:
    phones = set(duplicate_phones(db, campaign))
    if not phones or campaign.status != C.DRAFT:
        return 0
    deleted = (
        db.query(CampaignRecipient)
        .filter(CampaignRecipient.campaign_id == campaign.id, CampaignRecipient.phone.in_(phones))
        .delete(synchronize_session=False)
    )
    campaign.recipient_count = max(0, (campaign.recipient_count or 0) - deleted)
    return deleted
