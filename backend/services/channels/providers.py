"""Provider send layer.

Returns a provider msg id, the token "ok" when the provider has no id, or None.
reply_to is WaSender msgId (int) or inbound key.id (str); ignored by Meta/IG/Messenger.
"""
from typing import Optional, TYPE_CHECKING

from backend.models.agent import Agent
from backend.services.channels import whatsapp, wasender
from backend.core.logger import log_error

if TYPE_CHECKING:
    from backend.models.agent_channel import AgentChannel


async def send_template(
    agent: Agent,
    to: str,
    template_name: str,
    language: str,
    components: list[dict],
) -> bool:
    """Send a pre-approved template message (Meta only).

    WA Sender does not use templates — callers should use send_message instead.
    """
    if agent.provider != "meta":
        log_error("providers", "send_template called for non-meta provider")
        return False

    return await whatsapp.send_template(
        agent.phone_number_id,
        agent.access_token,
        to,
        template_name,
        language,
        components,
    )


async def send_message(
    agent: Agent, to: str, text: str, reply_to: int | str | None = None,
) -> str | None:
    if agent.provider == "wasender":
        config = agent.provider_config or {}
        api_key = config.get("api_key", "")
        session = config.get("session", "default")
        if not api_key:
            return None
        return await wasender.send_message(api_key, session, to, text, reply_to=reply_to)
    ok = await whatsapp.send_message(
        agent.phone_number_id, agent.access_token, to, text,
    )
    return "ok" if ok else None


async def send_media(
    agent: Agent,
    to: str,
    media_url: str,
    media_type: str,
    caption: str | None = None,
    filename: str | None = None,
    reply_to: int | str | None = None,
) -> str | None:
    if agent.provider == "wasender":
        config = agent.provider_config or {}
        api_key = config.get("api_key", "")
        session = config.get("session", "default")
        if not api_key:
            return None
        if media_type == "document":
            return await wasender.send_document(
                api_key, session, to, media_url, filename or "file", caption, reply_to=reply_to,
            )
        return await wasender.send_media(
            api_key, session, to, media_url, media_type, caption, reply_to=reply_to,
        )
    if media_type == "document":
        ok = await whatsapp.send_document(
            agent.phone_number_id, agent.access_token, to, media_url, filename or "file", caption,
        )
        return "ok" if ok else None
    ok = await whatsapp.send_media(
        agent.phone_number_id, agent.access_token, to, media_url, media_type, caption,
        voice=(media_type in ("audio", "voice")),
    )
    return "ok" if ok else None


# ── New unified channel API ────────────────────────────────────────────────────

async def send_channel_message(
    channel: "AgentChannel",
    to: str,
    text: str,
    db=None,
    reply_to: int | str | None = None,
) -> str | None:
    from backend.core.encryption import decrypt_credentials

    try:
        creds = decrypt_credentials(channel.credentials_encrypted)
    except Exception as e:
        log_error("send_channel", f"credential decryption failed: {e}")
        return None

    ct = channel.channel_type

    if ct == "whatsapp_wasender":
        return await wasender.send_message(
            creds["api_key"], creds.get("session", "default"), to, text, reply_to=reply_to,
        )

    if ct == "whatsapp_meta":
        token = await _ensure_valid_token(db, channel, creds)
        ok = await whatsapp.send_message(channel.external_account_id, token, to, text)
        return "ok" if ok else None

    if ct == "instagram":
        from backend.services.channels.instagram import send_message as ig_send
        ok = await ig_send(creds["access_token"], channel.page_id or channel.external_account_id, to, text)
        return "ok" if ok else None

    if ct == "messenger":
        from backend.services.channels.messenger import send_message as ms_send
        ok = await ms_send(creds["access_token"], channel.page_id or channel.external_account_id, to, text)
        return "ok" if ok else None

    log_error("send_channel", f"unknown channel_type: {ct}")
    return None


async def send_channel_template(
    channel: "AgentChannel",
    to: str,
    template_name: str,
    language: str,
    components: list[dict],
    db=None,
) -> bool:
    """Send an approved WhatsApp template via a Meta channel."""
    if channel.channel_type != "whatsapp_meta":
        log_error("send_channel", "send_channel_template called for non-meta channel")
        return False

    from backend.core.encryption import decrypt_credentials

    try:
        creds = decrypt_credentials(channel.credentials_encrypted)
    except Exception as e:
        log_error("send_channel", f"credential decryption failed: {e}")
        return False

    token = await _ensure_valid_token(db, channel, creds)
    return await whatsapp.send_template(
        channel.external_account_id, token, to, template_name, language, components,
    )


async def send_channel_media(
    channel: "AgentChannel",
    to: str,
    media_url: str,
    media_type: str,
    caption: Optional[str] = None,
    filename: Optional[str] = None,
    db=None,
    voice: bool = False,
    reply_to: int | str | None = None,
) -> str | None:
    from backend.core.encryption import decrypt_credentials

    try:
        creds = decrypt_credentials(channel.credentials_encrypted)
    except Exception as e:
        log_error("send_channel", f"credential decryption failed: {e}")
        return None

    ct = channel.channel_type

    if ct == "whatsapp_wasender":
        if media_type == "document":
            return await wasender.send_document(
                creds["api_key"], creds.get("session", "default"),
                to, media_url, filename or "file", caption, reply_to=reply_to,
            )
        return await wasender.send_media(
            creds["api_key"], creds.get("session", "default"),
            to, media_url, media_type, caption, reply_to=reply_to,
        )

    if ct == "whatsapp_meta":
        token = await _ensure_valid_token(db, channel, creds)
        if media_type == "document":
            ok = await whatsapp.send_document(
                channel.external_account_id, token, to, media_url, filename or "file", caption,
            )
        else:
            ok = await whatsapp.send_media(
                channel.external_account_id, token, to, media_url, media_type, caption,
                voice=voice or media_type in ("audio", "voice"),
            )
        return "ok" if ok else None

    if ct == "instagram":
        from backend.services.channels.instagram import send_media as ig_media
        ok = await ig_media(
            creds["access_token"], channel.page_id or channel.external_account_id,
            to, media_url, media_type, caption,
        )
        return "ok" if ok else None

    if ct == "messenger":
        from backend.services.channels.messenger import send_media as ms_media
        ok = await ms_media(
            creds["access_token"], channel.page_id or channel.external_account_id,
            to, media_url, media_type, caption, filename,
        )
        return "ok" if ok else None

    log_error("send_channel", f"unknown channel_type: {ct}")
    return None


async def _ensure_valid_token(db, channel: "AgentChannel", creds: dict) -> str:
    """Return valid access_token, refreshing via Redis lock if expired.

    Facebook long-lived tokens last ~60 days. Refresh is done by passing
    the current access_token as fb_exchange_token (no separate refresh_token).
    """
    from datetime import datetime, timedelta

    token = creds.get("access_token", "")
    expires_at = creds.get("token_expires_at")

    if not expires_at:
        return token

    exp = datetime.fromisoformat(expires_at)
    if datetime.utcnow() < exp - timedelta(days=7):
        return token

    if db is None:
        return token

    lock_key = f"token_refresh:{channel.id}"
    try:
        import redis.asyncio as aioredis
        from backend.core.config import settings

        r = aioredis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
        acquired = await r.set(lock_key, "1", nx=True, ex=30)
        if not acquired:
            import asyncio
            await asyncio.sleep(2)
            from backend.models.agent_channel import AgentChannel as AC
            from backend.core.encryption import decrypt_credentials
            fresh = db.query(AC).get(channel.id)
            if fresh:
                creds = decrypt_credentials(fresh.credentials_encrypted)
            return creds.get("access_token", "")

        try:
            from backend.services.meta.oauth import refresh_token
            new_data = await refresh_token(token)
            if new_data:
                creds["access_token"] = new_data["access_token"]
                creds["token_expires_at"] = new_data["token_expires_at"]
                from backend.services.channels.agent_channels import update_credentials
                update_credentials(db, channel, creds)
                db.commit()
                return new_data["access_token"]
            return token
        finally:
            await r.delete(lock_key)
            await r.aclose()
    except Exception as e:
        log_error("token_refresh", f"failed: {e}")
        return token
