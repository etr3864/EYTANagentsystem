"""Persist group WhatsApp messages into the inbox. No LLM / STT / vision."""
from datetime import datetime

from backend.core.database import SessionLocal
from backend.core.logger import log_error
from backend.services.channels import wasender
from backend.services.channels.agent_channels import get_channel, get_channel_by_type, get_credentials
from backend.services.channels.channel_users import get_by_external_id
from backend.services.entities import agents, conversations, users
from backend.services.media.inbox import ingest_from_url, too_large_text
from backend.services.messaging import messages
from backend.services.messaging.outbound import attach_whatsapp

_PLACEHOLDER = {
    "audio": "[הודעה קולית]",
    "image": "[תמונה]",
    "video": "[וידאו]",
    "document": "[קובץ]",
}
_STORED = {"audio": "voice", "image": "image", "video": "video", "document": "document"}
_INGEST = {"audio": "audio", "image": "image", "video": "video", "document": "document"}


def _sender_label(db, channel_id: int | None, phone: str, push_name: str) -> str:
    name = (push_name or "").strip()
    if name:
        return name[:100]
    if channel_id and phone:
        cu = get_by_external_id(db, channel_id, phone)
        if cu and cu.display_name:
            return cu.display_name[:100]
    if phone:
        row = users.get_by_phone(db, phone)
        if row and row.name:
            return row.name[:100]
        return phone[-4:] if len(phone) >= 4 else phone
    return "חבר בקבוצה"


async def _media(api_key: str, agent_id: int, msg_data: dict) -> tuple[str, str, str | None, bool]:
    msg_type = msg_data.get("msg_type") or "text"
    caption = (msg_data.get("text") or "").strip()
    if msg_type == "text":
        return caption, "text", None, False
    placeholder = msg_data.get("filename") or _PLACEHOLDER.get(msg_type, "[מדיה]")
    stored = _STORED.get(msg_type, "text")
    url = await wasender.decrypt_media(api_key, msg_data["message_key"], msg_data["message_data"])
    if not url:
        return caption or placeholder, stored, None, False
    ingested = await ingest_from_url(
        agent_id, url, _INGEST.get(msg_type, "document"),
        msg_data.get("mime_type"), msg_data.get("filename"),
    )
    body = caption or placeholder
    if ingested.too_large:
        body = too_large_text(_INGEST.get(msg_type, "document"), msg_data.get("filename"), ingested.size)
        if caption:
            body = f"{body}\n{caption}"
    return body, stored, ingested.media_url, ingested.too_large


async def persist_group_inbound(agent_id: int, channel_id: int | None, msg_data: dict) -> None:
    db = SessionLocal()
    try:
        agent = agents.get_by_id(db, agent_id)
        if not agent:
            return
        jid = msg_data["group_jid"]
        channel = get_channel(db, channel_id) if channel_id else None
        if not channel:
            channel = get_channel_by_type(db, agent_id, "whatsapp_wasender")
        if not channel:
            return
        creds = get_credentials(channel)
        text, msg_type, media_url, too_large = await _media(
            creds.get("api_key") or "", agent.id, msg_data,
        )
        if not text and not media_url:
            return
        user = users.get_or_create(db, jid, None)
        conv = conversations.get_or_create(db, agent.id, user.id)
        attach_whatsapp(db, conv, channel, jid)
        sender_phone = msg_data.get("sender_phone") or ""
        messages.add(
            db, conv.id, "user", text,
            message_type=msg_type,
            media_url=media_url,
            media_too_large=too_large,
            reply_to_text=msg_data.get("quoted_text"),
            provider_msg_id=msg_data.get("provider_msg_id"),
            sender_name=_sender_label(
                db, channel.id, sender_phone, msg_data.get("sender_name") or "",
            ),
            sender_phone=sender_phone or None,
        )
        now = datetime.utcnow()
        conv.updated_at = now
        conv.last_customer_message_at = now
        db.commit()
    except Exception as exc:
        log_error("group_inbox", str(exc)[:80])
    finally:
        db.close()
