"""WA Sender webhook handler."""
import asyncio
from dataclasses import dataclass
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Header
from sqlalchemy.orm import Session

from backend.core.database import SessionLocal
from backend.core.logger import log_error, log_audio, log_image, log
from backend.models.agent import Agent
from backend.services import media
from backend.services.entities import agents
from backend.services.messaging import buffer as message_buffer
from backend.services.media import transcription
from backend.services.channels import wasender
from backend.services.messaging.buffer import PendingMessage
from backend.services.messaging.processing import process_batched_messages, is_duplicate
from backend.services.channels.agent_channels import get_channel_by_type, get_credentials
from backend.services.channels.channel_users import (
    get_or_create_for_incoming, get_by_external_id, IncomingUserInfo,
)

router = APIRouter(tags=["webhook-wasender"])


@dataclass
class _ResolvedConfig:
    api_key: str
    session: str


def _resolve_credentials(db: Session, agent: Agent) -> _ResolvedConfig:
    """Resolve WaSender credentials from AgentChannel or legacy provider_config."""
    channel = get_channel_by_type(db, agent.id, "whatsapp_wasender")
    if channel:
        try:
            creds = get_credentials(channel)
            return _ResolvedConfig(
                api_key=creds.get("api_key", ""),
                session=creds.get("session", "default"),
            )
        except Exception:
            pass
    config = agent.provider_config or {}
    return _ResolvedConfig(
        api_key=config.get("api_key", ""),
        session=config.get("session", "default"),
    )


async def _process_audio(api_key: str, msg_data: dict, agent_name: str) -> tuple[str, str]:
    """Process incoming audio → returns (text, msg_type)."""
    log_audio("received", agent=agent_name, provider="wasender")
    public_url = await wasender.decrypt_media(api_key, msg_data["message_key"], msg_data["message_data"])
    if not public_url:
        return "[הודעה קולית - לא הצלחתי לפענח]", "voice"
    audio_bytes = await media.download_from_url(public_url)
    if not audio_bytes:
        return "[הודעה קולית - לא הצלחתי להוריד]", "voice"
    transcript = await transcription.transcribe_audio(audio_bytes)
    if transcript:
        return f"[הודעה קולית]: {transcript}", "voice"
    log_error("audio", "transcription failed")
    return "[הודעה קולית - לא הצלחתי לתמלל]", "voice"


async def _process_image(api_key: str, msg_data: dict, agent_name: str) -> tuple[str, str, Optional[str], Optional[str]]:
    """Process incoming image → returns (text, msg_type, image_base64, mime_type)."""
    log_image("received", agent=agent_name, provider="wasender")
    public_url = await wasender.decrypt_media(api_key, msg_data["message_key"], msg_data["message_data"])
    if not public_url:
        return "[תמונה - לא הצלחתי לפענח]", "text", None, None
    image_base64 = await media.download_url_as_base64(public_url)
    if not image_base64:
        log_error("image", "download failed")
        return "[תמונה - לא הצלחתי להוריד]", "text", None, None
    mime = media.get_media_type_from_mime(msg_data.get("mime_type", "image/jpeg"))
    return "[תמונה]", "image", image_base64, mime


async def _process_video(api_key: str, msg_data: dict, agent_name: str) -> tuple[str, str, Optional[str], Optional[str]]:
    """Process incoming video → decrypt, extract first frame, return as image for AI."""
    from backend.services.media.video import extract_first_frame

    log("VIDEO", agent=agent_name, provider="wasender")
    public_url = await wasender.decrypt_media(api_key, msg_data["message_key"], msg_data["message_data"])
    if not public_url:
        return "[וידאו]", "video", None, None

    video_bytes = await media.download_from_url(public_url)
    if not video_bytes:
        log_error("video", "download failed")
        return "[וידאו]", "video", None, None

    frame_base64 = extract_first_frame(video_bytes)
    caption = msg_data.get("text", "")
    text = f"[וידאו]: {caption}" if caption else "[וידאו]"
    return text, "video", frame_base64, "image/jpeg"


async def _resolve_channel_user(
    db: Session, agent_id: int, phone: str, name: Optional[str], api_key: str,
) -> tuple[Optional[int], Optional[int]]:
    """Resolve channel_id and channel_user_id, caching profile pic to R2."""
    channel = get_channel_by_type(db, agent_id, "whatsapp_wasender")
    if not channel:
        return None, None
    try:
        existing = get_by_external_id(db, channel.id, phone)
        needs_pic = not existing or not existing.profile_pic_url or not _is_r2_url(existing.profile_pic_url)

        cu_id = get_or_create_for_incoming(
            db, channel,
            IncomingUserInfo(external_id=phone, display_name=name),
        )
        db.commit()

        if needs_pic:
            asyncio.create_task(_cache_profile_pic(api_key, phone, cu_id))

        return channel.id, cu_id
    except Exception as e:
        log_error("wasender", f"channel_user upsert failed: {e}")
        return channel.id, None


async def _cache_profile_pic(api_key: str, phone: str, channel_user_id: int) -> None:
    """Fetch WA pic URL and immediately cache to R2 before it expires."""
    try:
        from backend.services.media.storage import cache_profile_pic

        log("PIC_FETCH", phone=phone, cu=channel_user_id)
        pic_url = await wasender.get_profile_pic(api_key, phone)
        if not pic_url:
            log("PIC_NONE", cu=channel_user_id, reason="get_profile_pic returned None")
            return

        r2_url = await cache_profile_pic(pic_url, channel_user_id)
        if not r2_url:
            log("PIC_NONE", cu=channel_user_id, reason="cache_profile_pic failed")
            return

        db = SessionLocal()
        try:
            from sqlalchemy import text as sa_text
            db.execute(
                sa_text("UPDATE channel_users SET profile_pic_url = :url, updated_at = NOW() WHERE id = :id"),
                {"url": r2_url, "id": channel_user_id},
            )
            db.commit()
            log("PIC_OK", cu=channel_user_id)
        finally:
            db.close()
    except Exception as e:
        log_error("profile_pic_cache", f"wasender cu={channel_user_id}: {e}")


def _is_r2_url(url: str) -> bool:
    from backend.core.config import settings
    r2_base = settings.r2_public_url or ""
    return bool(r2_base) and url.startswith(r2_base)


async def handle_wasender_message(agent_id: int, msg_data: dict):
    """Orchestrate incoming WaSender message handling."""
    db = SessionLocal()
    try:
        agent = agents.get_by_id(db, agent_id)
        if not agent or agent.provider != "wasender":
            log_error("wasender", f"agent_id={agent_id} invalid or not wasender")
            return

        phone = msg_data["phone"]
        name = msg_data.get("name")
        msg_type = msg_data["msg_type"]
        creds = _resolve_credentials(db, agent)

        text = msg_data.get("text", "")
        image_base64 = None
        mime_type = None

        if msg_type == "audio":
            text, msg_type = await _process_audio(creds.api_key, msg_data, agent.name)
        elif msg_type == "image":
            text, msg_type, image_base64, mime_type = await _process_image(creds.api_key, msg_data, agent.name)
        elif msg_type == "video":
            text, msg_type, image_base64, mime_type = await _process_video(creds.api_key, msg_data, agent.name)
        elif msg_type == "document":
            filename = msg_data.get("filename", "")
            text = f"[קובץ: {filename}]" if filename else "[קובץ]"

        channel_id, channel_user_id = await _resolve_channel_user(db, agent.id, phone, name, creds.api_key)

        batching_config = agent.get_batching_config()
        debounce = batching_config.get("debounce_seconds", 3)
        max_batch = batching_config.get("max_batch_messages", 10)

        pending = PendingMessage(text=text, msg_type=msg_type, image_base64=image_base64, media_type=mime_type)

        async def send_fn(to: str, txt: str) -> bool:
            return await wasender.send_message(creds.api_key, creds.session, to, txt)

        async def send_media_fn(to: str, url: str, mt: str, caption: str | None, filename: str | None = None) -> bool:
            if mt == "document":
                return await wasender.send_document(creds.api_key, creds.session, to, url, filename or "file", caption)
            return await wasender.send_media(creds.api_key, creds.session, to, url, mt, caption)

        if debounce == 0:
            await process_batched_messages(
                agent.id, phone, name, [pending], send_fn, "wasender", send_media_fn,
                channel_id=channel_id, channel_user_id=channel_user_id,
            )
            return

        async def process_callback(pending_msgs: list[PendingMessage]):
            await process_batched_messages(
                agent.id, phone, name, pending_msgs, send_fn, "wasender", send_media_fn,
                channel_id=channel_id, channel_user_id=channel_user_id,
            )

        await message_buffer.add_message(
            agent_id=agent.id, user_phone=phone, text=text,
            debounce_seconds=debounce, max_messages=max_batch,
            process_callback=process_callback,
            msg_type=msg_type, image_base64=image_base64, media_type=mime_type,
        )
    finally:
        db.close()


@router.post("/webhook/wasender/{agent_id}")
async def receive_wasender_webhook(
    agent_id: int,
    request: Request,
    x_webhook_signature: Optional[str] = Header(None, alias="X-Webhook-Signature"),
):
    """Receive webhook from WA Sender for a specific agent."""
    db = SessionLocal()
    try:
        agent = agents.get_by_id(db, agent_id)
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        if agent.provider != "wasender":
            raise HTTPException(status_code=400, detail="Agent is not configured for WA Sender")

        config = agent.provider_config or {}
        webhook_secret = config.get("webhook_secret", "")
        if webhook_secret and not wasender.verify_signature(x_webhook_signature, webhook_secret):
            raise HTTPException(status_code=403, detail="Invalid signature")

        body = await request.json()
        msg_data = wasender.extract_message_data(body)

        if msg_data:
            message_id = msg_data.get("message_key", {}).get("id", "")
            if is_duplicate(message_id):
                return {"status": "ok", "duplicate": True}
            asyncio.create_task(handle_wasender_message(agent_id, msg_data))

        return {"status": "ok"}
    finally:
        db.close()
