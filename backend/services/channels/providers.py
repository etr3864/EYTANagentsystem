"""Provider abstraction layer for sending WhatsApp messages.

Legacy API (send_message / send_media / send_template) remains unchanged
for backward compatibility.

New unified API (send_channel_message / send_channel_media) routes via
AgentChannel rows and decrypts credentials on the fly.
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


async def send_message(agent: Agent, to: str, text: str) -> bool:
    """Send message via the appropriate provider based on agent configuration.
    
    Args:
        agent: Agent model with provider configuration
        to: Recipient phone number
        text: Message text to send
        
    Returns:
        True if message was sent successfully
    """
    if agent.provider == "wasender":
        config = agent.provider_config or {}
        api_key = config.get("api_key", "")
        session = config.get("session", "default")
        
        if not api_key:
            return False
        
        return await wasender.send_message(api_key, session, to, text)
    
    # Default: Meta WhatsApp Business API
    return await whatsapp.send_message(
        agent.phone_number_id,
        agent.access_token,
        to,
        text
    )


async def send_media(
    agent: Agent,
    to: str,
    media_url: str,
    media_type: str,
    caption: str | None = None,
    filename: str | None = None
) -> bool:
    """Send media via the appropriate provider based on agent configuration.
    
    Args:
        agent: Agent model with provider configuration
        to: Recipient phone number
        media_url: Public URL of media file
        media_type: 'image', 'video', or 'document'
        caption: Optional caption text
        filename: For documents - display filename for recipient
        
    Returns:
        True if media was sent successfully
    """
    if agent.provider == "wasender":
        config = agent.provider_config or {}
        api_key = config.get("api_key", "")
        session = config.get("session", "default")
        
        if not api_key:
            return False
        
        if media_type == "document":
            return await wasender.send_document(
                api_key, session, to, media_url, filename or "file", caption
            )
        return await wasender.send_media(api_key, session, to, media_url, media_type, caption)
    
    # Default: Meta WhatsApp Business API
    if media_type == "document":
        return await whatsapp.send_document(
            agent.phone_number_id,
            agent.access_token,
            to,
            media_url,
            filename or "file",
            caption
        )
    return await whatsapp.send_media(
        agent.phone_number_id,
        agent.access_token,
        to,
        media_url,
        media_type,
        caption
    )


# ── New unified channel API ────────────────────────────────────────────────────

async def send_channel_message(
    channel: "AgentChannel",
    to: str,
    text: str,
    db=None,
) -> bool:
    """Send a text message via any channel type using decrypted credentials.

    Args:
        channel: AgentChannel record (with encrypted credentials).
        to: Recipient identifier (phone / IG user ID / PSID).
        text: Message text.
        db: DB session (required for WA Meta token refresh).

    Returns:
        True if sent successfully.
    """
    from backend.core.encryption import decrypt_credentials

    try:
        creds = decrypt_credentials(channel.credentials_encrypted)
    except Exception as e:
        log_error("send_channel", f"credential decryption failed: {e}")
        return False

    ct = channel.channel_type

    if ct == "whatsapp_wasender":
        return await wasender.send_message(
            creds["api_key"], creds.get("session", "default"), to, text
        )

    if ct == "whatsapp_meta":
        token = await _ensure_valid_token(db, channel, creds)
        return await whatsapp.send_message(channel.external_account_id, token, to, text)

    if ct == "instagram":
        from backend.services.channels.instagram import send_message as ig_send
        return await ig_send(creds["access_token"], channel.page_id or channel.external_account_id, to, text)

    if ct == "messenger":
        from backend.services.channels.messenger import send_message as ms_send
        return await ms_send(creds["access_token"], channel.page_id or channel.external_account_id, to, text)

    log_error("send_channel", f"unknown channel_type: {ct}")
    return False


async def send_channel_media(
    channel: "AgentChannel",
    to: str,
    media_url: str,
    media_type: str,
    caption: Optional[str] = None,
    filename: Optional[str] = None,
    db=None,
) -> bool:
    """Send media via any channel type."""
    from backend.core.encryption import decrypt_credentials

    try:
        creds = decrypt_credentials(channel.credentials_encrypted)
    except Exception as e:
        log_error("send_channel", f"credential decryption failed: {e}")
        return False

    ct = channel.channel_type

    if ct == "whatsapp_wasender":
        if media_type == "document":
            return await wasender.send_document(
                creds["api_key"], creds.get("session", "default"),
                to, media_url, filename or "file", caption,
            )
        return await wasender.send_media(
            creds["api_key"], creds.get("session", "default"),
            to, media_url, media_type, caption,
        )

    if ct == "whatsapp_meta":
        token = await _ensure_valid_token(db, channel, creds)
        if media_type == "document":
            return await whatsapp.send_document(
                channel.external_account_id, token, to, media_url, filename or "file", caption
            )
        return await whatsapp.send_media(
            channel.external_account_id, token, to, media_url, media_type, caption
        )

    if ct == "instagram":
        from backend.services.channels.instagram import send_media as ig_media
        return await ig_media(
            creds["access_token"], channel.page_id or channel.external_account_id,
            to, media_url, media_type, caption,
        )

    if ct == "messenger":
        from backend.services.channels.messenger import send_media as ms_media
        return await ms_media(
            creds["access_token"], channel.page_id or channel.external_account_id,
            to, media_url, media_type, caption, filename,
        )

    log_error("send_channel", f"unknown channel_type: {ct}")
    return False


async def _ensure_valid_token(db, channel: "AgentChannel", creds: dict) -> str:
    """Return valid access_token, refreshing via Redis lock if expired."""
    from datetime import datetime, timedelta

    expires_at = creds.get("token_expires_at")
    if expires_at:
        exp = datetime.fromisoformat(expires_at)
        if datetime.utcnow() < exp - timedelta(minutes=5):
            return creds["access_token"]

    if db is None:
        return creds.get("access_token", "")

    lock_key = f"token_refresh:{channel.id}"
    try:
        import redis.asyncio as aioredis
        from backend.core.config import settings

        r = aioredis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
        acquired = await r.set(lock_key, "1", nx=True, ex=30)
        if not acquired:
            # Another instance refreshing — wait briefly then re-read
            import asyncio
            await asyncio.sleep(2)
            from backend.models.agent_channel import AgentChannel as AC
            from backend.core.encryption import decrypt_credentials
            channel = db.query(AC).get(channel.id)
            creds = decrypt_credentials(channel.credentials_encrypted)
            return creds.get("access_token", "")

        try:
            from backend.services.meta.oauth import refresh_token
            new_token = await refresh_token(creds["refresh_token"])
            creds["access_token"] = new_token["access_token"]
            creds["token_expires_at"] = new_token["expires_at"]
            from backend.core.encryption import encrypt_credentials
            from backend.services.channels.agent_channels import update_credentials
            update_credentials(db, channel, creds)
            db.commit()
            return new_token["access_token"]
        finally:
            await r.delete(lock_key)
            await r.aclose()
    except Exception as e:
        log_error("token_refresh", f"failed: {e}")
        return creds.get("access_token", "")
