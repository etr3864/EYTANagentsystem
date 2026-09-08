"""Persist inbound conversation media to R2.

Under the size cap: copy to agents/{agent_id}/inbox/{uuid}.ext and return a
permanent public URL. Over the cap: do not store; caller keeps the provider
URL (if any) so the UI can offer a manual download while it lasts.
"""
from __future__ import annotations

import asyncio
import io
from dataclasses import dataclass
from uuid import uuid4

from backend.core.config import settings
from backend.core.logger import log_error
from backend.services.media.storage import delete_file, delete_prefix, upload_file

# Caps for auto-persist. WhatsApp allows more; we refuse RAM/storage blowups.
MAX_BYTES = {
    "image": 8 * 1024 * 1024,
    "audio": 16 * 1024 * 1024,
    "video": 20 * 1024 * 1024,
    "document": 25 * 1024 * 1024,
}

_KIND_LABEL = {
    "image": "תמונה",
    "audio": "הודעה קולית",
    "video": "וידאו",
    "document": "קובץ",
}

_MIME_EXT = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/3gpp": "3gp",
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/aac": "m4a",
    "audio/amr": "amr",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "text/plain": "txt",
}


@dataclass
class PersistResult:
    media_url: str | None
    too_large: bool
    data: bytes | None
    size: int = 0


def max_bytes_for(kind: str) -> int:
    return MAX_BYTES.get(kind, MAX_BYTES["image"])


def too_large_text(kind: str, filename: str | None = None, size: int = 0) -> str:
    label = filename or _KIND_LABEL.get(kind, "קובץ")
    if size > 0:
        mb = max(size / (1024 * 1024), 0.1)
        size_s = f"{mb:.0f}MB" if mb >= 1 else f"{int(size / 1024)}KB"
        return f"[קובץ גדול מדי]: {label} · {size_s}"
    return f"[קובץ גדול מדי]: {label}"


def persist_bytes(
    agent_id: int,
    data: bytes,
    kind: str,
    mime: str | None = None,
    filename: str | None = None,
) -> PersistResult:
    """Store bytes on R2 if under cap. Never raises — failure just skips URL."""
    size = len(data)
    if size > max_bytes_for(kind):
        return PersistResult(media_url=None, too_large=True, data=None, size=size)

    if not settings.r2_configured:
        return PersistResult(media_url=None, too_large=False, data=data, size=size)

    content_type = (mime or "application/octet-stream").split(";")[0].strip()
    ext = _extension(content_type, filename)
    file_key = f"agents/{agent_id}/inbox/{uuid4().hex}.{ext}"
    try:
        url = upload_file(io.BytesIO(data), file_key, content_type, size)
        return PersistResult(media_url=url, too_large=False, data=data, size=size)
    except Exception as e:
        log_error("inbox", f"upload failed: {e}")
        return PersistResult(media_url=None, too_large=False, data=data, size=size)


def delete_stored(url: str | None) -> None:
    """Delete a conversation inbox object. Never touches the agent media catalog."""
    key = _inbox_key(url)
    if not key or not settings.r2_configured:
        return
    try:
        delete_file(key)
    except Exception as e:
        log_error("inbox", f"delete failed: {e}")


def delete_stored_urls(urls: list[str | None]) -> None:
    seen: set[str] = set()
    for url in urls:
        if not url or url in seen:
            continue
        seen.add(url)
        delete_stored(url)


def delete_agent_inbox(agent_id: int) -> None:
    """Wipe leftover conversation files when the agent itself is deleted."""
    if not settings.r2_configured:
        return
    try:
        delete_prefix(f"agents/{agent_id}/inbox/")
    except Exception as e:
        log_error("inbox", f"prefix delete failed: {e}")


def _inbox_key(url: str | None) -> str | None:
    """Extract R2 key only for customer inbound files.

    Allowed: agents/{agent_id}/inbox/{filename}
    Rejected: catalog paths (images / videos / documents), profile pics,
    Wasender temp URLs, or anything else.
    """
    if not url:
        return None
    path = url.split("?", 1)[0]
    idx = path.find("/agents/")
    if idx == -1:
        return None
    key = path[idx + 1:]
    parts = key.split("/")
    if len(parts) != 4:
        return None
    if parts[0] != "agents" or parts[2] != "inbox" or not parts[1].isdigit() or not parts[3]:
        return None
    return key


def _extension(mime: str, filename: str | None) -> str:
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
        if ext.isalnum() and 1 <= len(ext) <= 5:
            return ext
    clean = mime.split(";")[0].strip().lower()
    return _MIME_EXT.get(clean, "bin")


async def ingest_from_url(
    agent_id: int,
    url: str,
    kind: str,
    mime: str | None = None,
    filename: str | None = None,
) -> PersistResult:
    """Download a public URL, persist if under cap, else keep the source URL."""
    from backend.services.media import download_url_bounded

    bounded = await download_url_bounded(url, max_bytes_for(kind))
    if bounded.too_large:
        return PersistResult(media_url=url, too_large=True, data=None, size=bounded.size)
    if not bounded.data:
        return PersistResult(media_url=None, too_large=False, data=None, size=0)
    return await asyncio.to_thread(
        persist_bytes,
        agent_id, bounded.data, kind, mime or bounded.content_type, filename,
    )


async def ingest_from_whatsapp(
    agent_id: int,
    media_id: str,
    access_token: str,
    kind: str,
    mime: str | None = None,
    filename: str | None = None,
) -> PersistResult:
    """Download Graph media. Oversized files have no public URL to keep."""
    from backend.services.media import download_whatsapp_media_bounded

    bounded = await download_whatsapp_media_bounded(
        media_id, access_token, max_bytes_for(kind),
    )
    if bounded.too_large:
        return PersistResult(media_url=None, too_large=True, data=None, size=bounded.size)
    if not bounded.data:
        return PersistResult(media_url=None, too_large=False, data=None, size=0)
    return await asyncio.to_thread(
        persist_bytes,
        agent_id, bounded.data, kind, mime or bounded.content_type, filename,
    )
