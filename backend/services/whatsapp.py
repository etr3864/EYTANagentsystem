import httpx
from backend.core.logger import log_error, log

_API_URL = "https://graph.facebook.com/v22.0"


async def send_message(phone_number_id: str, access_token: str, to: str, text: str) -> bool:
    """Send text message via Meta WhatsApp API."""
    url = f"{_API_URL}/{phone_number_id}/messages"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "messaging_product": "whatsapp",
                    "to": to,
                    "type": "text",
                    "text": {"body": text}
                },
                timeout=30,
            )

        if response.status_code != 200:
            log_error("whatsapp", f"status={response.status_code}")
            return False
        
        return True
    except Exception as e:
        log_error("whatsapp", str(e)[:80])
        return False


async def send_media(
    phone_number_id: str,
    access_token: str,
    to: str,
    media_url: str,
    media_type: str,
    caption: str | None = None
) -> bool:
    """Send image or video via Meta WhatsApp API.
    
    Args:
        phone_number_id: WhatsApp phone number ID
        access_token: Meta API access token
        to: Recipient phone number
        media_url: Public URL of the media file
        media_type: 'image' or 'video'
        caption: Optional caption text
    """
    url = f"{_API_URL}/{phone_number_id}/messages"
    
    log("MEDIA", msg=f"sending {media_type} to {to[-4:]}", url=media_url[:50])
    
    # Meta API uses 'image' or 'video' as type
    api_type = media_type if media_type in ("image", "video") else "image"
    
    media_object = {"link": media_url}
    if caption:
        media_object["caption"] = caption
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "messaging_product": "whatsapp",
                    "to": to,
                    "type": api_type,
                    api_type: media_object
                },
                timeout=60,  # Longer timeout for media
            )
        
        if response.status_code != 200:
            # Log full error for debugging
            try:
                error_body = response.json()
                log_error("whatsapp", f"send_media status={response.status_code} error={str(error_body)[:150]}")
            except Exception:
                log_error("whatsapp", f"send_media status={response.status_code} body={response.text[:100]}")
            return False
        
        # Log success with message ID
        try:
            result = response.json()
            msg_id = result.get("messages", [{}])[0].get("id", "unknown")
            log("MEDIA", msg=f"sent successfully", id=msg_id[:20])
        except Exception:
            log("MEDIA", msg="sent (no id)")
        
        return True
    except Exception as e:
        log_error("whatsapp", f"send_media: {str(e)[:80]}")
        return False


async def send_document(
    phone_number_id: str,
    access_token: str,
    to: str,
    document_url: str,
    filename: str,
    caption: str | None = None
) -> bool:
    """Send document via Meta WhatsApp API.
    
    Args:
        phone_number_id: WhatsApp phone number ID
        access_token: Meta API access token
        to: Recipient phone number
        document_url: Public URL of the document
        filename: Display filename for recipient (e.g., "report.pdf")
        caption: Optional caption text
    """
    url = f"{_API_URL}/{phone_number_id}/messages"
    
    document_object = {
        "link": document_url,
        "filename": filename
    }
    if caption:
        document_object["caption"] = caption
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json"
                },
                json={
                    "messaging_product": "whatsapp",
                    "to": to,
                    "type": "document",
                    "document": document_object
                },
                timeout=90,
            )
        
        if response.status_code != 200:
            try:
                error_body = response.json()
                log_error("whatsapp", f"send_document status={response.status_code} error={str(error_body)[:150]}")
            except Exception:
                log_error("whatsapp", f"send_document status={response.status_code}")
            return False
        
        return True
    except Exception as e:
        log_error("whatsapp", f"send_document: {str(e)[:80]}")
        return False
