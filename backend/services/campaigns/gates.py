"""Checks that run after a row is claimed and before the HTTP call."""
from dataclasses import dataclass
from datetime import datetime, timedelta

from backend.services.campaigns import constants as C
from backend.services.campaigns import schedule
from backend.services.silence.policy import blocks_proactive


@dataclass
class Gate:
    action: str
    when: datetime | None = None
    status: str | None = None
    reason: str | None = None
    pause: str | None = None


def decide(db, agent, campaign, recipient, channel, now: datetime) -> Gate:
    if channel is None or (channel.health_status or "") in C.SESSION_DOWN:
        return Gate("pause", pause=C.PAUSE_SESSION, reason="session")
    if not agent.is_active or not agent.campaigns_enabled:
        reason = C.PAUSE_AGENT if not agent.is_active else C.PAUSE_FLAG
        return Gate("pause", pause=reason, reason=reason)
    if not schedule.in_window(now, campaign.window_start, campaign.window_end, campaign.timezone):
        opened = schedule.next_window_open(now, campaign.window_start, campaign.window_end, campaign.timezone)
        return Gate("wait", when=opened, reason="window")
    if recipient.replied_at is not None:
        return Gate("skip", status=C.SKIPPED, reason="replied")
    if _spoke_recently(db, agent.id, recipient.phone, campaign, now):
        return Gate("skip", status=C.SKIPPED, reason="recent")
    if blocks_proactive(db, agent, recipient.phone):
        return Gate("skip", status=C.BLOCKED, reason="blocked")
    if _over_daily(db, agent, now):
        return Gate("wait", when=schedule.local_midnight(now, agent.campaign_timezone) + timedelta(days=1))
    return Gate("send")


def pace_wait(now: datetime, hourly_cap: int, roll: float | None = None) -> datetime:
    gap = schedule.with_jitter(schedule.interval_seconds(hourly_cap), roll)
    return now + timedelta(seconds=gap)


def _over_daily(db, agent, now: datetime) -> bool:
    cap = agent.campaign_daily_cap
    if not cap or cap <= 0:
        return True
    start = schedule.local_midnight(now, agent.campaign_timezone)
    from backend.models.campaign import CampaignSend
    from backend.services.campaigns.constants import SENT

    sent = (
        db.query(CampaignSend.id)
        .filter(
            CampaignSend.agent_id == agent.id,
            CampaignSend.status == SENT,
            CampaignSend.sent_at >= start,
        )
        .count()
    )
    return sent >= cap


def _spoke_recently(db, agent_id: int, phone: str, campaign, now: datetime) -> bool:
    amount = campaign.skip_recent_amount
    unit = campaign.skip_recent_unit
    if not amount or unit not in ("minutes", "hours", "days"):
        return False
    from backend.models.user import User
    from backend.models.conversation import Conversation

    user = db.query(User).filter(User.phone == phone).first()
    if user is None:
        return False
    conv = (
        db.query(Conversation)
        .filter(
            Conversation.agent_id == agent_id,
            Conversation.user_id == user.id,
            Conversation.playground_link_id.is_(None),
        )
        .first()
    )
    if conv is None or conv.last_customer_message_at is None:
        return False
    delta = {"minutes": timedelta(minutes=amount), "hours": timedelta(hours=amount), "days": timedelta(days=amount)}
    return conv.last_customer_message_at > now - delta[unit]
