from sqlalchemy.orm import Session

from backend.models.agent import Agent
from backend.core.logger import log_error
from backend.services.channels import providers
from backend.services.channels.agent_channels import get_active_channels
from backend.services.escalation.validate import to_wasender_phone


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
        try:
            dest = to_wasender_phone(phone)
        except ValueError:
            results.append({"phone": phone, "ok": False})
            continue
        ok = False
        try:
            if channel:
                ok = await providers.send_channel_message(channel, dest, text, db)
            if not ok:
                ok = await providers.send_message(agent, dest, text)
        except Exception as exc:
            log_error("escalation_staff", f"{dest[:6]} {str(exc)[:80]}")
            ok = False
        results.append({"phone": dest, "ok": ok})
    return results
