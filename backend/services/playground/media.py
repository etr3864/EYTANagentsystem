"""Inbound playground files — same caps and pipeline prep as WhatsApp, R2 path only differs."""
from __future__ import annotations

import base64
import io
from uuid import uuid4

_MIME_KIND = {
    "image/jpeg": "image",
    "image/jpg": "image",
    "image/png": "image",
    "image/webp": "image",
    "image/gif": "image",
    "video/mp4": "video",
    "video/webm": "video",
    "video/3gpp": "video",
    "audio/ogg": "audio",
    "audio/opus": "audio",
    "audio/mpeg": "audio",
    "audio/mp4": "audio",
    "audio/aac": "audio",
    "audio/webm": "audio",
    "audio/wav": "audio",
    "application/pdf": "document",
    "application/msword": "document",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
    "application/vnd.ms-excel": "document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
    "text/plain": "document",
}

_EXT_KIND = {
    "jpg": "image", "jpeg": "image", "png": "image", "webp": "image", "gif": "image",
    "mp4": "video", "webm": "video", "3gp": "video",
    "ogg": "audio", "mp3": "audio", "m4a": "audio", "wav": "audio",
    "pdf": "document", "doc": "document", "docx": "document",
    "xls": "document", "xlsx": "document", "txt": "document",
}

_MIME_EXT = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
    "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm", "video/3gpp": "3gp",
    "audio/ogg": "ogg", "audio/opus": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
    "audio/aac": "m4a", "audio/webm": "webm", "audio/wav": "wav",
    "application/pdf": "pdf", "text/plain": "txt",
}


def kind_from_mime(mime: str, filename: str | None = None) -> str:
    clean = (mime or "").split(";")[0].strip().lower()
    if clean in _MIME_KIND:
        return _MIME_KIND[clean]
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
        if ext in _EXT_KIND:
            return _EXT_KIND[ext]
    raise ValueError("סוג קובץ לא נתמך")


def max_bytes_for(kind: str) -> int:
    from backend.services.media.inbox import max_bytes_for as cap
    return cap(kind)


def persist(link_id: int, user_id: int, data: bytes, kind: str, mime: str, filename: str | None):
    from backend.core.config import settings
    from backend.core.logger import log_error
    from backend.services.media.inbox import PersistResult

    size = len(data)
    if size > max_bytes_for(kind):
        return PersistResult(media_url=None, too_large=True, data=None, size=size)
    if not settings.r2_configured:
        return PersistResult(media_url=None, too_large=False, data=data, size=size)
    from backend.services.media.storage import upload_file

    ext = _extension(mime, filename)
    key = f"playground/{int(link_id)}/{int(user_id)}/{uuid4().hex}.{ext}"
    try:
        url = upload_file(io.BytesIO(data), key, mime.split(";")[0].strip() or "application/octet-stream", size)
        return PersistResult(media_url=url, too_large=False, data=data, size=size)
    except Exception as exc:
        log_error("playground_media", f"upload failed: {exc}")
        return PersistResult(media_url=None, too_large=False, data=data, size=size)


async def to_pending(
    *,
    link_id: int,
    user_id: int,
    data: bytes,
    mime: str,
    filename: str | None,
    caption: str,
    reply_to: str | None,
):
    from backend.services.media.inbox import too_large_text
    from backend.services.messaging.buffer import PendingMessage

    kind = kind_from_mime(mime, filename)
    stored = persist(link_id, user_id, data, kind, mime, filename)
    if stored.too_large:
        body = too_large_text(kind, filename, stored.size)
        cap = (caption or "").strip()
        if cap:
            body = f"{body}\n{cap}"
        return PendingMessage(
            text=body,
            msg_type=_msg_type(kind),
            media_url=stored.media_url,
            media_too_large=True,
            reply_to_text=reply_to,
        )
    return await _prepared(kind, stored, mime, filename, caption, reply_to)


async def hydrate_for_vision(msgs: list) -> None:
    """Fill image_base64 from the stored URL. Never used as a Redis payload."""
    from backend.services.media import download_url_bounded
    from backend.services.media.video import extract_first_frame

    for msg in msgs:
        if msg.image_base64 or not msg.media_url or msg.media_too_large:
            continue
        if msg.msg_type not in ("image", "video"):
            continue
        kind = "video" if msg.msg_type == "video" else "image"
        bounded = await download_url_bounded(msg.media_url, max_bytes_for(kind))
        if not bounded.data:
            continue
        if msg.msg_type == "video":
            msg.image_base64 = extract_first_frame(bounded.data)
            msg.media_type = "image/jpeg"
        else:
            msg.image_base64 = base64.b64encode(bounded.data).decode("utf-8")


def _msg_type(kind: str) -> str:
    return "voice" if kind == "audio" else kind


async def _prepared(
    kind: str,
    stored,
    mime: str,
    filename: str | None,
    caption: str,
    reply_to: str | None,
):
    from backend.services.messaging.buffer import PendingMessage
    caption = (caption or "").strip()
    text = caption
    image_b64 = None
    media_type = mime.split(";")[0].strip() or None
    if kind == "image":
        if stored.data:
            image_b64 = base64.b64encode(stored.data).decode("utf-8")
        text = caption or "[תמונה]"
        from backend.services.media import get_media_type_from_mime
        media_type = get_media_type_from_mime(mime or "image/jpeg")
    elif kind == "video":
        from backend.services.media.video import extract_first_frame
        if stored.data:
            image_b64 = extract_first_frame(stored.data)
        text = caption or "[וידאו]"
        media_type = "image/jpeg"
    elif kind == "document":
        from backend.services.media.document_extraction import inbound_text
        text = await inbound_text(filename, stored.data, mime)
    elif kind == "audio":
        from backend.services.media.transcription import transcribe_audio
        if stored.data:
            transcript = await transcribe_audio(stored.data)
            text = f"[הודעה קולית]: {transcript}" if transcript else "[הודעה קולית - לא הצלחתי לתמלל]"
        else:
            text = "[הודעה קולית - לא הצלחתי להוריד]"
    return PendingMessage(
        text=text,
        msg_type=_msg_type(kind),
        image_base64=image_b64,
        media_type=media_type,
        media_url=stored.media_url,
        reply_to_text=reply_to,
    )


def _extension(mime: str, filename: str | None) -> str:
    if filename and "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()
        if ext.isalnum() and 1 <= len(ext) <= 5:
            return ext
    return _MIME_EXT.get((mime or "").split(";")[0].strip().lower(), "bin")
