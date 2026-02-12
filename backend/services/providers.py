"""Provider abstraction layer for sending WhatsApp messages."""
from backend.models.agent import Agent
from backend.services import whatsapp, wasender


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
