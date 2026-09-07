from sqlalchemy.orm import Session

from backend.models.agent import Agent
from backend.services.channels import providers
from backend.services.channels.agent_channels import get_active_channels
from backend.core.logger import log_error


def _whatsapp_channel(db: Session, agent: Agent):
    channels = get_active_channels(db, agent.id)
    wasender = next((c for c in channels if c.channel_type == "whatsapp_wasender"), None)
    if wasender:
        return wasender
    return next((c for c in channels if c.channel_type == "whatsapp_meta"), None)


async def send_staff(
    db: Session, agent: Agent, phones: list[str], text: str
) -> list[dict]:
    results = []
    channel = _whatsapp_channel(db, agent)
    for phone in phones:
        ok = False
        try:
            if channel:
                ok = await providers.send_channel_message(channel, phone, text, db)
            if not ok:
                ok = await providers.send_message(agent, phone, text)
        except Exception as exc:
            log_error("escalation_staff", f"{phone[:6]} {str(exc)[:80]}")
            ok = False
        results.append({"phone": phone, "ok": ok})
    return results
