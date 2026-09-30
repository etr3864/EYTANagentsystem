"""Campaign rows for the API. Cost and caps stay off non-super responses."""
from datetime import datetime

from backend.models.agent_channel import AgentChannel
from backend.models.campaign import Campaign, CampaignStep, CampaignUsage
from backend.services.campaigns import constants as C
from backend.services.entities.pricing import calc_cost_ils, get_pricing


def percent(part: int, whole: int) -> float:
    if not whole:
        return 0.0
    return round(100 * part / whole, 1)


def campaign_row(db, campaign: Campaign, agent_name: str, session: str, *, full: bool) -> dict:
    sent = campaign.step_sent_count or 0
    total = campaign.recipient_count or 0
    replied = campaign.replied_count or 0
    row = {
        "id": campaign.id,
        "agent_id": campaign.agent_id,
        "agent_name": agent_name,
        "name": campaign.name,
        "status": campaign.status,
        "pause_reason": campaign.pause_reason,
        "session": session,
        "send_percent": percent(sent, total),
        "reply_percent": percent(replied, sent),
        "recipient_count": total,
        "current_step": campaign.current_step,
        "step_sent_count": sent,
        "updated_at": _iso(campaign.updated_at),
    }
    if not full:
        return row
    pricing = get_pricing(db)
    cost = 0.0
    tokens = 0
    for usage in db.query(CampaignUsage).filter(CampaignUsage.campaign_id == campaign.id):
        tokens += usage.input_tokens + usage.output_tokens
        cost += calc_cost_ils(
            usage.model,
            usage.input_tokens,
            usage.output_tokens,
            pricing,
            usage.cache_read_tokens,
            usage.cache_creation_tokens,
        )
    row.update({
        "description": campaign.description,
        "mode": campaign.mode,
        "template_body": campaign.template_body,
        "prompt": campaign.prompt,
        "column_defaults": campaign.column_defaults or {},
        "rephrase_enabled": campaign.rephrase_enabled,
        "writer_model": campaign.writer_model,
        "rephrase_model": campaign.rephrase_model,
        "window_start": campaign.window_start,
        "window_end": campaign.window_end,
        "timezone": campaign.timezone,
        "skip_recent_amount": campaign.skip_recent_amount,
        "skip_recent_unit": campaign.skip_recent_unit,
        "delivered_count": campaign.delivered_count or 0,
        "cost_ils": round(cost, 2),
        "tokens": tokens,
        "media_kind": campaign.media_kind,
        "media_name": campaign.media_name,
        "media_description": campaign.media_description,
        "steps": [
            {
                "position": step.position,
                "delay_minutes": step.delay_minutes,
                "template_body": step.template_body,
                "prompt": step.prompt,
            }
            for step in _steps(db, campaign.id)
        ],
    })
    return row


def session_label(db, agent_id: int) -> str:
    channel = (
        db.query(AgentChannel)
        .filter(
            AgentChannel.agent_id == agent_id,
            AgentChannel.channel_type == "whatsapp_wasender",
            AgentChannel.is_active.is_(True),
        )
        .first()
    )
    if channel is None:
        return "אין סשן"
    return channel.health_status or "unknown"


def _steps(db, campaign_id: int) -> list[CampaignStep]:
    return (
        db.query(CampaignStep)
        .filter(CampaignStep.campaign_id == campaign_id)
        .order_by(CampaignStep.position)
        .all()
    )


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None
