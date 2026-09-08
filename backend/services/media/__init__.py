"""WhatsApp media download service."""
from dataclasses import dataclass
from typing import Optional

import httpx
import base64

from backend.core.logger import log_error


@dataclass
class BoundedDownload:
    data: bytes | None = None
    too_large: bool = False
    size: int = 0
    content_type: str | None = None


def _content_type(response: httpx.Response) -> str | None:
    raw = response.headers.get("content-type")
    if not raw:
        return None
    return raw.split(";")[0].strip()


async def _stream_get(
    url: str,
    max_bytes: int,
    headers: dict | None = None,
) -> BoundedDownload:
    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            async with client.stream("GET", url, headers=headers or {}) as response:
                if response.status_code != 200:
                    log_error("media", f"download failed: {response.status_code}")
                    return BoundedDownload()
                cl = response.headers.get("content-length")
                if cl and int(cl) > max_bytes:
                    return BoundedDownload(
                        too_large=True, size=int(cl), content_type=_content_type(response),
                    )
                chunks: list[bytes] = []
                total = 0
                async for chunk in response.aiter_bytes(64 * 1024):
                    total += len(chunk)
                    if total > max_bytes:
                        return BoundedDownload(
                            too_large=True, size=total, content_type=_content_type(response),
                        )
                    chunks.append(chunk)
                data = b"".join(chunks)
                return BoundedDownload(
                    data=data, size=len(data), content_type=_content_type(response),
                )
    except Exception as e:
        log_error("media", str(e)[:80])
        return BoundedDownload()


async def download_from_url(url: str, max_bytes: int | None = None) -> Optional[bytes]:
    """Download media from a public URL (for WA Sender decrypted media)."""
    if max_bytes is None:
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
    result = await _stream_get(url, max_bytes)
    return result.data


async def download_url_bounded(url: str, max_bytes: int) -> BoundedDownload:
    return await _stream_get(url, max_bytes)


async def download_whatsapp_media(
    media_id: str, access_token: str, max_bytes: int | None = None,
) -> Optional[bytes]:
    """Download media from WhatsApp Cloud API (two-step: get URL, then download)."""
    result = await download_whatsapp_media_bounded(media_id, access_token, max_bytes)
    return result.data if result and not result.too_large else None


async def download_whatsapp_media_bounded(
    media_id: str, access_token: str, max_bytes: int | None = None,
) -> BoundedDownload:
    try:
        headers = {"Authorization": f"Bearer {access_token}"}
        async with httpx.AsyncClient() as client:
            url_response = await client.get(
                f"https://graph.facebook.com/v22.0/{media_id}",
                headers=headers,
            )
            if url_response.status_code != 200:
                log_error("media", f"get_url failed: {url_response.status_code}")
                return BoundedDownload()
            media_url = url_response.json().get("url")
            if not media_url:
                log_error("media", "no url in response")
                return BoundedDownload()

        if max_bytes is None:
            async with httpx.AsyncClient() as client:
                file_response = await client.get(media_url, headers=headers)
                if file_response.status_code != 200:
                    log_error("media", f"download failed: {file_response.status_code}")
                    return BoundedDownload()
                data = file_response.content
                return BoundedDownload(
                    data=data, size=len(data), content_type=_content_type(file_response),
                )
        return await _stream_get(media_url, max_bytes, headers=headers)
    except Exception as e:
        log_error("media", str(e)[:80])
        return BoundedDownload()


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
