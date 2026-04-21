"""Meta webhook handler — Instagram, Messenger, WhatsApp Meta.

Handles:
- GET  /webhook/meta  — webhook verification (challenge)
- POST /webhook/meta  — incoming messages (HMAC-verified)
- POST /api/meta/data-deletion — GDPR data deletion callback
- POST /api/meta/deauthorize   — user deauthorized the App

Security:
- All POST requests are verified with HMAC SHA-256 before any processing.
- Echo messages are filtered out before entering the pipeline.
- Deduplication uses message_id via ProcessedMessage (Redis-backed).
"""
import asyncio
import hashlib
import hmac

from fastapi import APIRouter, Request, HTTPException, Query

from backend.core.config import settings
from backend.core.hmac_verify import verify_meta_signature, select_secret_for_object
from backend.core.database import SessionLocal
from backend.core.logger import log, log_error
from backend.services.messaging.processing import is_duplicate, process_batched_messages
from backend.services.messaging.buffer import PendingMessage
from backend.services.channels.meta_webhook_parser import (
    parse_instagram_payload,
    parse_messenger_payload,
    parse_whatsapp_payload,
    ParsedIncomingMessage,
)
from backend.services.channels.agent_channels import get_channel_by_external_id
from backend.services.channels.channel_users import get_or_create_for_incoming, IncomingUserInfo
from backend.services.channels import providers

router = APIRouter(tags=["webhook-meta"])


@router.get("/webhook/meta")
async def verify_meta_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """Meta webhook verification endpoint (O(1) — single token from settings)."""
    if hub_mode != "subscribe":
        raise HTTPException(status_code=400, detail="Invalid hub.mode")

    if not settings.meta_verify_token:
        raise HTTPException(status_code=503, detail="META_VERIFY_TOKEN not configured")

    if hub_verify_token != settings.meta_verify_token:
        raise HTTPException(status_code=403, detail="Invalid verify_token")

    return int(hub_challenge)


@router.post("/webhook/meta")
async def receive_meta_webhook(request: Request):
    """Receive and dispatch incoming Meta webhook events.

    1. Verify HMAC signature — reject 401 if invalid.
    2. Parse payload to determine channel type.
    3. Route to per-channel handler.
    """
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    if not settings.meta_app_secret and not settings.meta_instagram_app_secret:
        raise HTTPException(status_code=503, detail="No META_APP_SECRET or META_INSTAGRAM_APP_SECRET configured")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    obj = payload.get("object", "")
    secret = select_secret_for_object(obj, settings.meta_app_secret, settings.meta_instagram_app_secret)

    if not secret or not verify_meta_signature(body, signature, secret):
        log_error("webhook_meta", f"HMAC failed for object={obj}")
        raise HTTPException(status_code=401, detail="Invalid HMAC signature")

    if obj == "instagram":
        messages = parse_instagram_payload(payload)
        asyncio.create_task(_dispatch_messages(messages))

    elif obj == "page":
        messages = parse_messenger_payload(payload)
        asyncio.create_task(_dispatch_messages(messages))

    elif obj == "whatsapp_business_account":
        messages = parse_whatsapp_payload(payload)
        asyncio.create_task(_dispatch_messages(messages))

    return {"status": "ok"}


async def _dispatch_messages(messages: list[ParsedIncomingMessage]) -> None:
    """Process a list of parsed Meta messages through the pipeline."""
    for msg in messages:
        if msg.is_echo:
            continue

        if is_duplicate(msg.message_id):
            log("dedup", msg=f"skipped duplicate {msg.message_id[:20]}")
            continue

        asyncio.create_task(_handle_single_message(msg))


async def _handle_single_message(msg: ParsedIncomingMessage) -> None:
    """Full message handling pipeline for a single parsed message."""
    db = SessionLocal()
    try:
        # O(1) lookup via UNIQUE(channel_type, external_account_id)
        channel = get_channel_by_external_id(db, msg.channel_type, msg.external_account_id)
        if not channel:
            log("webhook_meta_skip", msg=f"no channel for {msg.channel_type}/{msg.external_account_id}")
            return

        if not channel.agent or not channel.agent.is_active:
            log("webhook_meta_skip", msg=f"agent inactive for {msg.channel_type}/{msg.external_account_id}")
            return

        # For Instagram: fetch profile from API on first contact
        display_name = msg.display_name
        profile_pic = None
        profile_metadata = None
        if not display_name and msg.channel_type == "instagram":
            try:
                from backend.services.channels.credential_store import decrypt_credentials
                creds = decrypt_credentials(channel.credentials_encrypted)
                token = creds.get("access_token", "")
                from backend.services.channels.instagram import get_user_profile
                profile = await get_user_profile(token, msg.external_user_id)
                if profile:
                    display_name = profile.get("username") or profile.get("name")
                    profile_pic = profile.get("profile_picture_url")
                    profile_metadata = {
                        k: profile.get(k)
                        for k in ("follower_count", "is_verified_user", "is_user_follow_business")
                        if profile.get(k) is not None
                    }
            except Exception:
                pass

        channel_user_id = get_or_create_for_incoming(
            db,
            channel,
            IncomingUserInfo(
                external_id=msg.external_user_id,
                bsuid=msg.bsuid,
                display_name=display_name,
                profile_pic_url=profile_pic,
                metadata=profile_metadata,
            ),
        )
        db.commit()

        batching_config_defaults = {"debounce_seconds": 3, "max_batch_messages": 10}
        if channel.agent and hasattr(channel.agent, "get_batching_config"):
            batching_config = channel.agent.get_batching_config()
        else:
            batching_config = batching_config_defaults

        debounce = batching_config.get("debounce_seconds", 3)
        max_batch = batching_config.get("max_batch_messages", 10)

        # Build send functions using unified channel API
        async def send_fn(to: str, text: str) -> bool:
            from backend.services.messaging.retry import send_with_retry
            context = {
                "agent_name": getattr(channel.agent, "name", "?"),
                "channel_type": channel.channel_type,
                "to": to,
                "preview": text[:80],
            }
            return await send_with_retry(
                lambda: providers.send_channel_message(channel, to, text, db),
                context,
            )

        async def send_media_fn(to: str, url: str, media_type: str, caption=None, filename=None) -> bool:
            return await providers.send_channel_media(channel, to, url, media_type, caption, filename, db)

        # Download image for vision analysis
        image_base64 = None
        text = msg.text
        if msg.msg_type == "image" and msg.media_url:
            from backend.services import media
            image_base64 = await media.download_url_as_base64(msg.media_url)
            if image_base64:
                text = text or "[תמונה]"
            else:
                text = text or "[תמונה - לא הצלחתי להוריד]"
                log_error("webhook_meta", f"image download failed for {msg.channel_type}")
        elif msg.msg_type == "audio" and msg.media_url:
            from backend.services.media import download_from_url
            from backend.services.media.transcription import transcribe_audio
            audio_bytes = await download_from_url(msg.media_url)
            if audio_bytes:
                transcript = await transcribe_audio(audio_bytes)
                if transcript:
                    text = f"[הודעה קולית]: {transcript}"
                else:
                    text = text or "[הודעה קולית - לא הצלחתי לתמלל]"
            else:
                text = text or "[הודעה קולית - לא הצלחתי להוריד]"

        pending = PendingMessage(
            text=text,
            msg_type=msg.msg_type,
            image_base64=image_base64,
            media_type=msg.mime_type,
        )

        if debounce == 0:
            await process_batched_messages(
                channel.agent_id, msg.external_user_id, display_name,
                [pending], send_fn, msg.channel_type, send_media_fn,
                channel_id=channel.id, channel_user_id=channel_user_id,
            )
            return

        from backend.services.messaging import buffer as message_buffer

        async def process_callback(pending_msgs):
            await process_batched_messages(
                channel.agent_id, msg.external_user_id, display_name,
                pending_msgs, send_fn, msg.channel_type, send_media_fn,
                channel_id=channel.id, channel_user_id=channel_user_id,
            )

        await message_buffer.add_message(
            agent_id=channel.agent_id,
            user_phone=msg.external_user_id,
            text=text,
            debounce_seconds=debounce,
            max_messages=max_batch,
            process_callback=process_callback,
            msg_type=msg.msg_type,
            image_base64=image_base64,
            media_type=msg.mime_type,
        )

    except Exception as e:
        log_error("webhook_meta", f"handle_single_message: {e}")
    finally:
        db.close()


# ── GDPR / Platform policy endpoints ─────────────────────────────────────────

@router.post("/api/meta/data-deletion")
async def meta_data_deletion(request: Request):
    """Meta Data Deletion callback — required for App Review.

    Meta requires HTTP 200 within seconds. Deletion itself can complete within 24h.
    We perform synchronous deletion (10 customers = fast).
    """
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    any_secret = settings.meta_app_secret or settings.meta_instagram_app_secret
    if any_secret:
        ok = verify_meta_signature(body, signature, settings.meta_app_secret or "") or \
             verify_meta_signature(body, signature, settings.meta_instagram_app_secret or "")
        if not ok:
            raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    user_id = payload.get("user_id") or payload.get("signed_request", "")

    if user_id:
        asyncio.create_task(_delete_user_data(str(user_id)))

    return {
        "url": f"{settings.frontend_url}/data-deletion",
        "confirmation_code": f"optive-deletion-{user_id}",
    }


async def _delete_user_data(external_user_id: str) -> None:
    """Delete all channel_users records for this Meta user."""
    db = SessionLocal()
    try:
        from sqlalchemy import text
        db.execute(text("""
            DELETE FROM channel_users
            WHERE external_id = :uid
               OR bsuid = :uid
        """), {"uid": external_user_id})
        db.commit()
        log("gdpr", msg=f"deleted data for {external_user_id[:10]}***")
    except Exception as e:
        log_error("gdpr", f"data deletion failed: {e}")
        db.rollback()
    finally:
        db.close()


@router.post("/api/meta/deauthorize")
async def meta_deauthorize(request: Request):
    """Meta Deauthorize callback — user removed the App.

    Disables all channels associated with the deauthorized user/page.
    """
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")

    any_secret = settings.meta_app_secret or settings.meta_instagram_app_secret
    if any_secret:
        ok = verify_meta_signature(body, signature, settings.meta_app_secret or "") or \
             verify_meta_signature(body, signature, settings.meta_instagram_app_secret or "")
        if not ok:
            raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    page_id = payload.get("page_id") or payload.get("user_id")
    if page_id:
        asyncio.create_task(_deauthorize_channel(str(page_id)))

    return {"status": "ok"}


async def _deauthorize_channel(page_id: str) -> None:
    """Disable all channels matching this page_id."""
    db = SessionLocal()
    try:
        from backend.models.agent_channel import AgentChannel
        channels = db.query(AgentChannel).filter(
            AgentChannel.page_id == page_id,
            AgentChannel.is_active.is_(True),
        ).all()
        for ch in channels:
            ch.is_active = False
            ch.health_status = "deauthorized"
        db.commit()
        log("deauth", msg=f"deauthorized {len(channels)} channel(s) for page {page_id}")
    except Exception as e:
        log_error("deauth", f"failed for page {page_id}: {e}")
        db.rollback()
    finally:
        db.close()
