"""WA Sender API integration service."""
import asyncio
import httpx
from typing import Optional
from backend.core.logger import log_error

_BASE_URL = "https://wasenderapi.com/api"


def verify_signature(signature: str | None, webhook_secret: str) -> bool:
    """Verify WA Sender webhook signature (simple string comparison)."""
    if not signature or not webhook_secret:
        return False
    return signature == webhook_secret


def normalize_phone(phone: str) -> str:
    """Normalize phone number for WA Sender (JID format).
    
    Returns empty string for invalid phones (groups, broadcasts, linked IDs, etc).
    """
    # Reject group chats, broadcast lists, and linked device IDs
    if "@g.us" in phone or "@broadcast" in phone or "@lid" in phone:
        return ""
    
    # Remove common suffixes
    phone = phone.replace("@s.whatsapp.net", "")
    phone = phone.replace("@c.us", "")
    
    # Remove any non-digit chars except +
    cleaned = "".join(c for c in phone if c.isdigit() or c == "+")
    
    # Remove leading +
    if cleaned.startswith("+"):
        cleaned = cleaned[1:]
    
    # Validate: phone numbers are typically 10-15 digits, starting with country code
    # Reject if too long (likely not a real phone number)
    if len(cleaned) > 15:
        return ""
    
    # Reject if too short (less than 10 digits)
    if len(cleaned) < 10:
        return ""
    
    return cleaned


def format_jid(phone: str) -> str:
    """Format phone to JID format for API calls."""
    cleaned = normalize_phone(phone)
    return f"{cleaned}@s.whatsapp.net"


async def send_message(api_key: str, session: str, to: str, text: str, max_retries: int = 3) -> bool:
    """Send text message via WA Sender API with retry on rate limit."""
    url = f"{_BASE_URL}/send-message"
    
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "session": session,
                        "to": format_jid(to),
                        "text": text
                    },
                    timeout=30,
                )
            
            if response.status_code == 429:
                # Rate limited - wait and retry
                wait_time = (attempt + 1) * 2  # 2s, 4s, 6s
                if attempt < max_retries - 1:
                    await asyncio.sleep(wait_time)
                    continue
                log_error("wasender", "rate_limited (max retries)")
                return False
            
            if response.status_code != 200:
                # Log full error details for debugging
                try:
                    error_body = response.json()
                    log_error("wasender", f"send status={response.status_code} body={str(error_body)[:100]}")
                except Exception:
                    log_error("wasender", f"send status={response.status_code} body={response.text[:100]}")
                return False
            
            data = response.json()
            return data.get("success", False)
            
        except Exception as e:
            log_error("wasender", str(e)[:80])
            return False
    
    return False


async def send_media(
    api_key: str,
    session: str,
    to: str,
    media_url: str,
    media_type: str,
    caption: str | None = None,
    max_retries: int = 3
) -> bool:
    """Send image or video via WA Sender API.
    
    Uses /send-message endpoint with imageUrl or videoUrl parameter.
    
    Args:
        api_key: WA Sender API key
        session: WA Sender session ID
        to: Recipient phone number
        media_url: Public URL of the media file
        media_type: 'image' or 'video'
        caption: Optional caption text
        max_retries: Retry count for rate limits
    """
    url = f"{_BASE_URL}/send-message"
    
    payload = {
        "session": session,
        "to": format_jid(to),
    }
    
    # WA Sender uses imageUrl/videoUrl instead of generic media field
    if media_type == "image":
        payload["imageUrl"] = media_url
    elif media_type == "video":
        payload["videoUrl"] = media_url
    else:
        log_error("wasender", f"send_media: unsupported type {media_type}")
        return False
    
    if caption:
        payload["text"] = caption
    
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json=payload,
                    timeout=60,  # Longer timeout for media
                )
            
            if response.status_code == 429:
                wait_time = (attempt + 1) * 2
                if attempt < max_retries - 1:
                    await asyncio.sleep(wait_time)
                    continue
                log_error("wasender", "send_media rate_limited (max retries)")
                return False
            
            if response.status_code != 200:
                try:
                    error_body = response.json()
                    log_error("wasender", f"send_media status={response.status_code} body={str(error_body)[:100]}")
                except Exception:
                    log_error("wasender", f"send_media status={response.status_code}")
                return False
            
            data = response.json()
            # WA Sender returns success or data with message info
            return data.get("success", True) if isinstance(data, dict) else True
            
        except Exception as e:
            log_error("wasender", f"send_media: {str(e)[:60]}")
            return False
    
    return False


async def decrypt_media(api_key: str, message_key: dict, message_data: dict) -> Optional[str]:
    """Decrypt media and get public URL."""
    url = f"{_BASE_URL}/decrypt-media"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "data": {
                        "messages": {
                            "key": message_key,
                            "message": message_data
                        }
                    }
                },
                timeout=60,
            )
        
        if response.status_code != 200:
            log_error("wasender", f"decrypt_media status={response.status_code}")
            return None
        
        data = response.json()
        if data.get("success"):
            return data.get("publicUrl")
        
        return None
        
    except Exception as e:
        log_error("wasender", f"decrypt_media: {str(e)[:60]}")
        return None


def extract_message_data(payload: dict) -> Optional[dict]:
    """Extract normalized message data from WA Sender webhook payload.
    
    Returns dict with:
        - phone: sender phone number
        - name: sender name  
        - text: message text (or None for media)
        - msg_type: "text", "audio", "image"
        - message_key: for decrypt_media
        - message_data: for decrypt_media
        - timestamp: message timestamp
    """
    try:
        event = payload.get("event", "")
        if event not in ("messages.received", "messages.upsert", "messages-personal.received"):
            return None
        
        data = payload.get("data", {})
        messages_data = data.get("messages", {})
        
        # Extract key info
        key = messages_data.get("key", {})
        
        if key.get("fromMe", False):
            return None  # Ignore our own messages
        
        # Get phone from key - prioritize cleanedSenderPn (for @lid addressing mode)
        # Fallback chain: cleanedSenderPn -> senderPn -> participant -> remoteJid
        phone_jid = (
            key.get("cleanedSenderPn", "") or
            key.get("senderPn", "") or
            key.get("participant", "") or
            key.get("remoteJid", "")
        )
        phone = normalize_phone(phone_jid)
        if not phone:
            return None
        
        name = messages_data.get("pushName", "")
        timestamp = messages_data.get("messageTimestamp", 0)
        message = messages_data.get("message", {})
        
        result = {
            "phone": phone,
            "name": name,
            "timestamp": timestamp,
            "message_key": key,
            "message_data": message,
        }
        
        # Determine message type
        if message.get("imageMessage"):
            result["msg_type"] = "image"
            result["text"] = message.get("imageMessage", {}).get("caption", "")
            result["mime_type"] = message.get("imageMessage", {}).get("mimetype", "image/jpeg")
        elif message.get("audioMessage"):
            result["msg_type"] = "audio"
            result["text"] = ""
            result["mime_type"] = message.get("audioMessage", {}).get("mimetype", "audio/ogg")
        elif message.get("conversation"):
            result["msg_type"] = "text"
            result["text"] = message.get("conversation", "")
        elif messages_data.get("messageBody"):
            result["msg_type"] = "text"
            result["text"] = messages_data.get("messageBody", "")
        else:
            # Unknown message type
            return None
        
        return result
        
    except Exception as e:
        log_error("wasender", f"extract: {str(e)[:60]}")
        return None
