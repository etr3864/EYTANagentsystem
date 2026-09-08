"""WA Sender webhook handler."""
import asyncio
from dataclasses import dataclass
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Header
from sqlalchemy.orm import Session

from backend.core.database import SessionLocal
from backend.core.logger import log_error, log_audio, log_image, log
from backend.models.agent import Agent
from backend.services.entities import agents
from backend.services.messaging import buffer as message_buffer
from backend.services.media import transcription
from backend.services.media.inbox import ingest_from_url, too_large_text
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


@dataclass
class _InboundMedia:
    text: str
    msg_type: str
    image_base64: Optional[str] = None
    mime_type: Optional[str] = None
    media_url: Optional[str] = None
    media_too_large: bool = False


async def _decrypt(api_key: str, msg_data: dict) -> Optional[str]:
    return await wasender.decrypt_media(api_key, msg_data["message_key"], msg_data["message_data"])


async def _process_audio(api_key: str, msg_data: dict, agent_id: int, agent_name: str) -> _InboundMedia:
    log_audio("received", agent=agent_name, provider="wasender")
    public_url = await _decrypt(api_key, msg_data)
    if not public_url:
        return _InboundMedia("[הודעה קולית - לא הצלחתי לפענח]", "voice")
    ingested = await ingest_from_url(
        agent_id, public_url, "audio", msg_data.get("mime_type"),
    )
    if ingested.too_large:
        return _InboundMedia(
            too_large_text("audio", size=ingested.size), "voice",
            media_url=ingested.media_url, media_too_large=True,
        )
    if not ingested.data:
        return _InboundMedia("[הודעה קולית - לא הצלחתי להוריד]", "voice")
    transcript = await transcription.transcribe_audio(ingested.data)
    text = f"[הודעה קולית]: {transcript}" if transcript else "[הודעה קולית - לא הצלחתי לתמלל]"
    if not transcript:
        log_error("audio", "transcription failed")
    return _InboundMedia(text, "voice", media_url=ingested.media_url)


async def _process_image(api_key: str, msg_data: dict, agent_id: int, agent_name: str) -> _InboundMedia:
    import base64
    from backend.services.media import get_media_type_from_mime

    log_image("received", agent=agent_name, provider="wasender")
    caption = (msg_data.get("text") or "").strip()
    public_url = await _decrypt(api_key, msg_data)
    if not public_url:
        return _InboundMedia(caption or "[תמונה - לא הצלחתי לפענח]", "text")
    ingested = await ingest_from_url(
        agent_id, public_url, "image", msg_data.get("mime_type"),
    )
    mime = get_media_type_from_mime(msg_data.get("mime_type", "image/jpeg"))
    if ingested.too_large:
        body = too_large_text("image", size=ingested.size)
        if caption:
            body = f"{body}\n{caption}"
        return _InboundMedia(
            body, "image",
            media_url=ingested.media_url, media_too_large=True,
        )
    if not ingested.data:
        log_error("image", "download failed")
        return _InboundMedia(caption or "[תמונה - לא הצלחתי להוריד]", "text")
    return _InboundMedia(
        caption or "[תמונה]", "image",
        image_base64=base64.b64encode(ingested.data).decode("utf-8"),
        mime_type=mime,
        media_url=ingested.media_url,
    )


async def _process_video(api_key: str, msg_data: dict, agent_id: int, agent_name: str) -> _InboundMedia:
    from backend.services.media.video import extract_first_frame

    log("VIDEO", agent=agent_name, provider="wasender")
    caption = (msg_data.get("text") or "").strip()
    public_url = await _decrypt(api_key, msg_data)
    if not public_url:
        return _InboundMedia(caption or "[וידאו]", "video")
    ingested = await ingest_from_url(
        agent_id, public_url, "video", msg_data.get("mime_type"),
    )
    if ingested.too_large:
        body = too_large_text("video", size=ingested.size)
        if caption:
            body = f"{body}\n{caption}"
        return _InboundMedia(
            body, "video",
            media_url=ingested.media_url, media_too_large=True,
        )
    if not ingested.data:
        log_error("video", "download failed")
        return _InboundMedia(caption or "[וידאו]", "video")
    return _InboundMedia(
        caption or "[וידאו]", "video",
        image_base64=extract_first_frame(ingested.data),
        mime_type="image/jpeg",
        media_url=ingested.media_url,
    )


async def _process_document(api_key: str, msg_data: dict, agent_id: int) -> _InboundMedia:
    from backend.services.media.document_extraction import document_label, inbound_text

    filename = msg_data.get("filename") or ""
    mime = msg_data.get("mime_type")
    label = document_label(filename)
    public_url = await _decrypt(api_key, msg_data)
    if not public_url:
        return _InboundMedia(label, "document")
    ingested = await ingest_from_url(
        agent_id, public_url, "document", mime, filename,
    )
    if ingested.too_large:
        return _InboundMedia(
            too_large_text("document", filename, ingested.size), "document",
            media_url=ingested.media_url, media_too_large=True,
        )
    text = await inbound_text(filename, ingested.data, mime)
    return _InboundMedia(text, "document", media_url=ingested.media_url)


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


_PIC_THROTTLE_SECONDS = 600  # 10 min between failed attempts per user


async def _should_attempt_pic(channel_user_id: int) -> bool:
    """Throttle pic fetches to once per 10 min (Redis-backed; fail-open)."""
    try:
        from backend.services.meta.rate_limiter import _get_redis
        r = await _get_redis()
        if not r:
            return True
        key = f"wa:pic_attempt:{channel_user_id}"
        if await r.set(key, "1", ex=_PIC_THROTTLE_SECONDS, nx=True) is None:
            return False
        return True
    except Exception:
        return True


async def _cache_profile_pic(api_key: str, phone: str, channel_user_id: int) -> None:
    """Fetch WA pic URL and cache to R2. Throttled per user to prevent spam."""
    if not await _should_attempt_pic(channel_user_id):
        return
    try:
        from backend.services.media.storage import cache_profile_pic

        pic_url = await wasender.get_profile_pic(api_key, phone)
        if not pic_url:
            return
        r2_url = await cache_profile_pic(pic_url, channel_user_id)
        if not r2_url:
            return

        db = SessionLocal()
        try:
            from sqlalchemy import text as sa_text
            db.execute(
                sa_text("UPDATE channel_users SET profile_pic_url = :url, updated_at = NOW() WHERE id = :id"),
                {"url": r2_url, "id": channel_user_id},
            )
            db.commit()
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
        if not agent.is_active:
            return

        phone = msg_data["phone"]
        name = msg_data.get("name")
        msg_type = msg_data["msg_type"]
        creds = _resolve_credentials(db, agent)

        text = msg_data.get("text", "")
        image_base64 = None
        mime_type = None
        media_url = None
        media_too_large = False
        quoted_text = msg_data.get("quoted_text")

        if msg_type == "audio":
            inbound = await _process_audio(creds.api_key, msg_data, agent.id, agent.name)
        elif msg_type == "image":
            inbound = await _process_image(creds.api_key, msg_data, agent.id, agent.name)
        elif msg_type == "video":
            inbound = await _process_video(creds.api_key, msg_data, agent.id, agent.name)
        elif msg_type == "document":
            inbound = await _process_document(creds.api_key, msg_data, agent.id)
        else:
            inbound = None

        if inbound:
            text = inbound.text
            msg_type = inbound.msg_type
            image_base64 = inbound.image_base64
            mime_type = inbound.mime_type
            media_url = inbound.media_url
            media_too_large = inbound.media_too_large

        channel_id, channel_user_id = await _resolve_channel_user(db, agent.id, phone, name, creds.api_key)

        batching_config = agent.get_batching_config()
        debounce = batching_config.get("debounce_seconds", 3)
        max_batch = batching_config.get("max_batch_messages", 10)

        pending = PendingMessage(
            text=text, msg_type=msg_type, image_base64=image_base64,
            media_type=mime_type, media_url=media_url, media_too_large=media_too_large,
            reply_to_text=quoted_text,
        )

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
            media_url=media_url, media_too_large=media_too_large,
            reply_to_text=quoted_text,
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
        if not agent.is_active:
            return {"status": "ok", "skipped": "agent_inactive"}

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
