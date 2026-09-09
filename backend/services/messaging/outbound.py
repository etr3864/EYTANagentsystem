"""Manual outbound send: text, media, voice, templates, new WhatsApp chats."""
from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from backend.core.logger import log, log_error
from backend.models.agent import Agent
from backend.models.agent_channel import AgentChannel
from backend.models.conversation import Conversation
from backend.models.message import Message
from backend.models.user import User
from backend.models.whatsapp_template import WhatsAppTemplate
from backend.services.channels import providers
from backend.services.channels.agent_channels import get_channel, get_channel_by_type
from backend.services.channels.channel_users import IncomingUserInfo, get_or_create_for_incoming
from backend.services.entities import conversations, users
from backend.services.messaging import messages
from backend.services.media.inbox import persist_bytes

WINDOW_SECONDS = 24 * 3600
_BODY_VAR = re.compile(r"\{\{(\d+)\}\}")


class OutboundError(Exception):
    def __init__(self, detail: str, status_code: int = 400):
        self.detail = detail
        self.status_code = status_code


def customer_window_open(conv: Conversation) -> bool:
    ts = conv.last_customer_message_at
    if not ts:
        return False
    return (datetime.utcnow() - ts).total_seconds() < WINDOW_SECONDS


def normalize_msisdn(raw: str) -> str:
    from backend.services.channels.wasender import normalize_phone

    digits = "".join(c for c in (raw or "") if c.isdigit())
    if digits.startswith("0") and len(digits) >= 9:
        digits = "972" + digits[1:]
    elif len(digits) == 9 and digits.startswith("5"):
        digits = "972" + digits
    phone = normalize_phone(digits)
    if not phone:
        raise OutboundError("מספר טלפון לא תקין")
    return phone


def active_whatsapp_channel(db: Session, agent: Agent) -> Optional[AgentChannel]:
    for ct in ("whatsapp_wasender", "whatsapp_meta"):
        ch = get_channel_by_type(db, agent.id, ct)
        if ch:
            return ch
    return None


def is_meta_whatsapp(channel: Optional[AgentChannel], agent: Agent) -> bool:
    if channel:
        return channel.channel_type == "whatsapp_meta"
    return agent.provider == "meta"


def needs_template_gate(channel: Optional[AgentChannel], agent: Agent, conv: Conversation) -> bool:
    return is_meta_whatsapp(channel, agent) and not customer_window_open(conv)


def require_freeform(channel: Optional[AgentChannel], agent: Agent, conv: Conversation) -> None:
    if needs_template_gate(channel, agent, conv):
        raise OutboundError("חלון 24 שעות סגור. שלח תבנית מאושרת.")


def recipient_for(db: Session, conv: Conversation, user: User) -> str:
    if conv.channel_user_id:
        from backend.models.channel_user import ChannelUser

        cu = db.get(ChannelUser, conv.channel_user_id)
        if cu and cu.external_id:
            return cu.external_id
    return user.phone


def resolve_send_channel(db: Session, conv: Conversation) -> Optional[AgentChannel]:
    if not conv.channel_id:
        return None
    channel = get_channel(db, conv.channel_id)
    if not channel or not channel.is_active:
        raise OutboundError("הערוץ לא פעיל או לא נמצא")
    return channel


def attach_whatsapp(db: Session, conv: Conversation, channel: AgentChannel, phone: str) -> None:
    if not conv.channel_id:
        conv.channel_id = channel.id
        conv.channel_type_snapshot = channel.channel_type
    if not conv.channel_user_id:
        cu_id = get_or_create_for_incoming(
            db, channel, IncomingUserInfo(external_id=phone),
        )
        conv.channel_user_id = cu_id
    db.commit()
    db.refresh(conv)


def touch_conversation(db: Session, conv: Conversation) -> None:
    conv.updated_at = datetime.utcnow()
    db.commit()


async def open_whatsapp_chat(db: Session, agent: Agent, phone_raw: str) -> Conversation:
    if not agent.is_active:
        raise OutboundError("הסוכן לא פעיל")
    phone = normalize_msisdn(phone_raw)
    channel = active_whatsapp_channel(db, agent)
    if not channel and agent.provider not in ("wasender", "meta"):
        raise OutboundError("אין ערוץ וואטסאפ פעיל לסוכן הזה")

    user = users.get_or_create(db, phone)
    conv = conversations.get_or_create(db, agent.id, user.id)
    if channel:
        attach_whatsapp(db, conv, channel, phone)
        if channel.channel_type == "whatsapp_wasender" and conv.channel_user_id:
            from backend.models.channel_user import ChannelUser
            cu = db.get(ChannelUser, conv.channel_user_id)
            if not cu or not cu.profile_pic_url:
                await _prefetch_wasender_pic(channel.id, phone, conv.channel_user_id)
    return conv


async def send_text(db: Session, conv: Conversation, text: str) -> Message:
    text = (text or "").strip()
    if not text:
        raise OutboundError("אין טקסט לשליחה")
    agent, user, channel = _load_send_context(db, conv)
    require_freeform(channel, agent, conv)
    ok = await _dispatch_text(db, channel, agent, recipient_for(db, conv, user), text)
    if not ok:
        raise OutboundError("שליחת ההודעה נכשלה", 500)
    msg = messages.add(db, conv.id, "assistant", text, message_type="manual")
    touch_conversation(db, conv)
    log("MANUAL_SEND", agent=agent.name, user=user.name or user.phone[-4:])
    return msg


async def send_bytes(
    db: Session,
    conv: Conversation,
    data: bytes,
    content_type: str,
    filename: str,
    caption: str | None = None,
    as_voice: bool = False,
) -> Message:
    agent, user, channel = _load_send_context(db, conv)
    require_freeform(channel, agent, conv)
    kind = _kind_from_upload(content_type, filename, as_voice)
    data, content_type, filename, kind = _prepare_media(data, content_type, filename, kind)

    persisted = await asyncio.to_thread(
        persist_bytes, agent.id, data, _persist_kind(kind), content_type, filename,
    )
    if persisted.too_large:
        raise OutboundError("הקובץ גדול מדי")
    if not persisted.media_url:
        raise OutboundError("לא ניתן להעלות מדיה")

    to = recipient_for(db, conv, user)
    ok = await _dispatch_media(
        db, channel, agent, to, persisted.media_url, kind, caption, filename,
    )
    if not ok:
        raise OutboundError("שליחת המדיה נכשלה", 500)

    content = _media_content(kind, filename, caption)
    msg = messages.add(
        db, conv.id, "assistant", content,
        message_type=_message_type(kind),
        media_url=persisted.media_url,
    )
    touch_conversation(db, conv)
    log("MANUAL_SEND", agent=agent.name, kind=kind, user=user.name or user.phone[-4:])
    return msg


async def send_template_message(
    db: Session,
    conv: Conversation,
    template_id: int,
    body_params: list[str],
    header_data: bytes | None = None,
    header_content_type: str = "",
    header_filename: str = "header",
) -> Message:
    agent, user, channel = _load_send_context(db, conv)
    if not is_meta_whatsapp(channel, agent):
        raise OutboundError("תבניות זמינות רק בוואטסאפ רשמי")

    tpl = db.query(WhatsAppTemplate).filter(
        WhatsAppTemplate.id == template_id,
        WhatsAppTemplate.agent_id == agent.id,
        WhatsAppTemplate.status == "APPROVED",
    ).first()
    if not tpl:
        raise OutboundError("התבנית לא נמצאה או לא מאושרת")

    header_url = tpl.header_media_url
    if header_data:
        header_url = await _persist_header(agent.id, tpl, header_data, header_content_type, header_filename)
    components = build_template_components(tpl, body_params, header_url)
    to = recipient_for(db, conv, user)
    ok = await _dispatch_template(db, channel, agent, to, tpl, components)
    if not ok:
        raise OutboundError("שליחת התבנית נכשלה", 500)

    content = _template_preview(tpl, body_params)
    msg = messages.add(db, conv.id, "assistant", content, message_type="manual")
    touch_conversation(db, conv)
    log("MANUAL_SEND", agent=agent.name, template=tpl.name, user=user.name or user.phone[-4:])
    return msg


def build_template_components(
    tpl: WhatsAppTemplate,
    body_params: list[str],
    header_media_url: str | None,
) -> list[dict]:
    components: list[dict] = []
    raw = tpl.components or []
    if isinstance(raw, dict):
        raw = raw.get("components") or []

    header = next((c for c in raw if str(c.get("type", "")).upper() == "HEADER"), None)
    if header:
        fmt = str(header.get("format") or "").upper()
        if fmt in ("IMAGE", "VIDEO", "DOCUMENT"):
            if not header_media_url:
                raise OutboundError("חסר קובץ לכותרת התבנית")
            key = fmt.lower()
            components.append({
                "type": "header",
                "parameters": [{"type": key, key: {"link": header_media_url}}],
            })

    body = next((c for c in raw if str(c.get("type", "")).upper() == "BODY"), None)
    needed = _var_count((body or {}).get("text") or "")
    if needed:
        if len(body_params) < needed:
            raise OutboundError(f"חסרים משתנים בגוף התבנית ({needed})")
        components.append({
            "type": "body",
            "parameters": [{"type": "text", "text": str(p)} for p in body_params[:needed]],
        })
    return components


def parse_body_params(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise OutboundError("משתני התבנית לא תקינים")
    if not isinstance(data, list):
        raise OutboundError("משתני התבנית לא תקינים")
    return [str(p) for p in data]


def _load_send_context(
    db: Session, conv: Conversation,
) -> tuple[Agent, User, Optional[AgentChannel]]:
    from backend.services.entities import agents as agents_svc

    agent = agents_svc.get_by_id(db, conv.agent_id)
    user = users.get_by_id(db, conv.user_id)
    if not agent or not user:
        raise OutboundError("סוכן או לקוח לא נמצאו", 404)
    if not agent.is_active:
        raise OutboundError("הסוכן לא פעיל")
    channel = resolve_send_channel(db, conv)
    return agent, user, channel


async def _dispatch_text(db, channel, agent, to: str, text: str) -> bool:
    if channel:
        return await providers.send_channel_message(channel, to, text, db)
    return await providers.send_message(agent, to, text)


async def _dispatch_media(
    db, channel, agent, to: str, url: str, kind: str, caption: str | None, filename: str,
) -> bool:
    media_type = "audio" if kind == "voice" else kind
    if channel:
        return await providers.send_channel_media(
            channel, to, url, media_type, caption, filename, db, voice=(kind == "voice"),
        )
    return await providers.send_media(agent, to, url, media_type, caption, filename)


async def _dispatch_template(db, channel, agent, to: str, tpl: WhatsAppTemplate, components: list) -> bool:
    if channel:
        return await providers.send_channel_template(
            channel, to, tpl.name, tpl.language, components, db,
        )
    return await providers.send_template(agent, to, tpl.name, tpl.language, components)


def _kind_from_upload(content_type: str, filename: str, as_voice: bool) -> str:
    if as_voice:
        return "voice"
    ct = (content_type or "").split(";")[0].strip().lower()
    name = (filename or "").lower()
    if ct.startswith("image/") or name.endswith((".jpg", ".jpeg", ".png", ".webp", ".gif")):
        return "image"
    if ct.startswith("video/") or name.endswith((".mp4", ".mov", ".3gp", ".webm")):
        return "video"
    if ct.startswith("audio/"):
        return "voice"
    return "document"


def _prepare_media(data: bytes, content_type: str, filename: str, kind: str):
    if kind != "voice":
        return data, content_type, filename, kind
    from backend.services.media.voice import VoiceConvertError, to_ogg_opus

    try:
        converted = to_ogg_opus(data)
    except VoiceConvertError as e:
        raise OutboundError(str(e))
    return converted, "audio/ogg", "voice.ogg", "voice"


def _persist_kind(kind: str) -> str:
    return "audio" if kind == "voice" else kind


def _message_type(kind: str) -> str:
    return {"image": "image", "video": "video", "document": "document", "voice": "voice"}.get(kind, "manual")


def _media_content(kind: str, filename: str, caption: str | None) -> str:
    if caption and caption.strip():
        return caption.strip()
    if kind == "image":
        return "[תמונה]"
    if kind == "video":
        return "[וידאו]"
    if kind == "voice":
        return "[הודעה קולית]"
    return f"[קובץ: {filename or 'file'}]"


def _var_count(text: str) -> int:
    nums = [int(m) for m in _BODY_VAR.findall(text or "")]
    return max(nums) if nums else 0


def _template_preview(tpl: WhatsAppTemplate, body_params: list[str]) -> str:
    raw = tpl.components or []
    if isinstance(raw, dict):
        raw = raw.get("components") or []
    body = next((c for c in raw if str(c.get("type", "")).upper() == "BODY"), None)
    text = (body or {}).get("text") or ""
    if text:
        filled = text
        for i, val in enumerate(body_params, start=1):
            filled = filled.replace(f"{{{{{i}}}}}", str(val))
        return filled
    return f"[תבנית: {tpl.name}]"


async def _persist_header(agent_id: int, tpl: WhatsAppTemplate, data: bytes, content_type: str, filename: str) -> str:
    raw = tpl.components or []
    if isinstance(raw, dict):
        raw = raw.get("components") or []
    header = next((c for c in raw if str(c.get("type", "")).upper() == "HEADER"), None)
    fmt = str((header or {}).get("format") or "IMAGE").upper()
    kind = {"IMAGE": "image", "VIDEO": "video", "DOCUMENT": "document"}.get(fmt, "image")
    persisted = await asyncio.to_thread(persist_bytes, agent_id, data, kind, content_type, filename)
    if persisted.too_large:
        raise OutboundError("קובץ הכותרת גדול מדי")
    if not persisted.media_url:
        raise OutboundError("לא ניתן להעלות את קובץ הכותרת")
    return persisted.media_url


async def _prefetch_wasender_pic(channel_id: int, phone: str, channel_user_id: int | None) -> None:
    if not channel_user_id:
        return
    try:
        from backend.core.database import SessionLocal
        from backend.core.encryption import decrypt_credentials
        from backend.services.channels import wasender
        from backend.services.media.storage import cache_profile_pic
        from sqlalchemy import text as sa_text

        db = SessionLocal()
        try:
            channel = get_channel(db, channel_id)
            if not channel:
                return
            creds = decrypt_credentials(channel.credentials_encrypted)
            api_key = creds.get("api_key") or ""
            if not api_key:
                return
        finally:
            db.close()

        pic_url = await wasender.get_profile_pic(api_key, phone)
        if not pic_url:
            return
        r2_url = await cache_profile_pic(pic_url, channel_user_id)
        if not r2_url:
            return

        db = SessionLocal()
        try:
            db.execute(
                sa_text("UPDATE channel_users SET profile_pic_url = :url, updated_at = NOW() WHERE id = :id"),
                {"url": r2_url, "id": channel_user_id},
            )
            db.commit()
        finally:
            db.close()
    except Exception as e:
        log_error("profile_pic_cache", f"outbound cu={channel_user_id}: {e}")
