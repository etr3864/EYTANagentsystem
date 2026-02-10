"""WhatsApp media download service."""
import httpx
import base64
from typing import Optional

from backend.core.logger import log_error


async def download_whatsapp_media(media_id: str, access_token: str) -> Optional[bytes]:
    """Download media from WhatsApp Cloud API (two-step: get URL, then download)."""
    try:
        async with httpx.AsyncClient() as client:
            url_response = await client.get(
                f"https://graph.facebook.com/v18.0/{media_id}",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            
            if url_response.status_code != 200:
                log_error("media", f"get_url failed: {url_response.status_code}")
                return None
            
            media_url = url_response.json().get("url")
            if not media_url:
                log_error("media", "no url in response")
                return None
            
            file_response = await client.get(
                media_url,
                headers={"Authorization": f"Bearer {access_token}"}
            )
            
            if file_response.status_code != 200:
                log_error("media", f"download failed: {file_response.status_code}")
                return None
            
            return file_response.content
            
    except Exception as e:
        log_error("media", str(e)[:80])
        return None


async def download_from_url(url: str) -> Optional[bytes]:
    """Download media from a public URL (for WA Sender decrypted media)."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=60)
            
            if response.status_code != 200:
                log_error("media", f"url_download failed: {response.status_code}")
                return None
            
            return response.content
            
    except Exception as e:
        log_error("media", str(e)[:80])
        return None


async def download_image_as_base64(media_id: str, access_token: str) -> Optional[str]:
    """Download image from Meta API and return as base64 string."""
    image_bytes = await download_whatsapp_media(media_id, access_token)
    if image_bytes:
        return base64.b64encode(image_bytes).decode('utf-8')
    return None


async def download_url_as_base64(url: str) -> Optional[str]:
    """Download image from URL and return as base64 string (for WA Sender)."""
    image_bytes = await download_from_url(url)
    if image_bytes:
        return base64.b64encode(image_bytes).decode('utf-8')
    return None


def get_media_type_from_mime(mime_type: str) -> str:
    """Convert MIME type to Claude's format."""
    mime_map = {
        "image/jpeg": "image/jpeg",
        "image/jpg": "image/jpeg",
        "image/png": "image/png",
        "image/gif": "image/gif",
        "image/webp": "image/webp",
    }
    return mime_map.get(mime_type.lower(), "image/jpeg")
