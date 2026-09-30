"""Persist the outbound bubble and the campaign context for the later reply."""
from datetime import datetime

from sqlalchemy.orm.attributes import flag_modified

from backend.services.entities import conversations, users
from backend.services.messaging import messages
from backend.services.messaging.outbound import attach_whatsapp


def live_chat(db, agent_id: int, phone: str):
    user = users.get_by_phone(db, phone)
    if user is None:
        return None
    return conversations.get_live(db, agent_id, user.id)


def reveal(db, agent_id: int, phone: str) -> int | None:
    conv = live_chat(db, agent_id, phone)
    if conv is None:
        return None
    conv.campaign_pending = False
    conv.updated_at = datetime.utcnow()
    return conv.id


def store_outbound(db, agent, campaign, recipient, body: str, channel, provider_msg_id: str, *, hide_until_reply: bool = True) -> None:
    user = users.get_or_create(db, recipient.phone, None)
    conv = conversations.get_or_create(db, agent.id, user.id)
    if hide_until_reply and conv.last_customer_message_at is None:
        conv.campaign_pending = True
    if not hide_until_reply:
        conv.campaign_pending = False
    if channel is not None:
        attach_whatsapp(db, conv, channel, recipient.phone)
    context = dict(conv.injected_context or {})
    context["campaign"] = {
        "id": campaign.id,
        "name": campaign.name,
        "brief": campaign.description or "",
        "fields": recipient.fields or {},
        "media": campaign.media_description or "",
        "prompt": campaign.prompt or "",
        "template": campaign.template_body or "",
    }
    conv.injected_context = context
    flag_modified(conv, "injected_context")
    media_url = None
    if campaign.media_key:
        from backend.services.media.storage import get_public_url
        media_url = get_public_url(campaign.media_key)
    messages.add(
        db,
        conv.id,
        "assistant",
        body,
        message_type="campaign",
        media_url=media_url,
        provider_msg_id=provider_msg_id,
        sender_name=campaign.name,
    )
