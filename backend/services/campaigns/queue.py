"""Create the next pending rows for one step. Callers own the transaction."""
from datetime import datetime, timedelta

from backend.models.campaign import CampaignRecipient, CampaignSend, CampaignStep
from backend.services.campaigns.constants import PENDING, SKIPPED


def enqueue_step(db, campaign, position: int, start_at: datetime | None = None) -> int:
    step = (
        db.query(CampaignStep)
        .filter(CampaignStep.campaign_id == campaign.id, CampaignStep.position == position)
        .first()
    )
    delay = timedelta(minutes=step.delay_minutes if step else 0)
    when = (start_at or datetime.utcnow()) + (delay if position > 1 else timedelta())
    recipients = (
        db.query(CampaignRecipient)
        .filter(CampaignRecipient.campaign_id == campaign.id, CampaignRecipient.replied_at.is_(None))
        .all()
    )
    created = 0
    for recipient in recipients:
        if _blocked_earlier(db, recipient.id):
            continue
        exists = (
            db.query(CampaignSend.id)
            .filter(CampaignSend.recipient_id == recipient.id, CampaignSend.step_position == position)
            .first()
        )
        if exists is not None:
            continue
        db.add(CampaignSend(
            campaign_id=campaign.id,
            agent_id=campaign.agent_id,
            recipient_id=recipient.id,
            step_position=position,
            status=PENDING,
            next_send_at=when,
        ))
        created += 1
    return created


def _blocked_earlier(db, recipient_id: int) -> bool:
    row = (
        db.query(CampaignSend.id)
        .filter(
            CampaignSend.recipient_id == recipient_id,
            CampaignSend.status.in_((SKIPPED, "blocked", "invalid", "uncertain")),
        )
        .first()
    )
    return row is not None
