"""Persist the outbound bubble and the campaign context for the later reply."""
from sqlalchemy.orm.attributes import flag_modified

from backend.services.entities import conversations, users
from backend.services.messaging import messages
from backend.services.messaging.outbound import attach_whatsapp


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
