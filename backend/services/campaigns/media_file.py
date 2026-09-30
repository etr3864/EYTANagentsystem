"""One campaign file. Kind comes from the bytes, not the name."""
import base64
import io

from backend.services.media.inbox import MAX_BYTES
from backend.services.media.storage import generate_file_key, upload_file

_IMAGE = (
    (b"\xff\xd8\xff", "image", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image", "image/png"),
    (b"RIFF", "image", "image/webp"),
)
_PDF = b"%PDF"


def detect(payload: bytes) -> tuple[str, str]:
    if payload.startswith(_PDF):
        return "document", "application/pdf"
    if len(payload) >= 12 and payload[4:8] == b"ftyp":
        return "video", "video/mp4"
    for magic, kind, mime in _IMAGE:
        if payload.startswith(magic):
            if magic == b"RIFF" and payload[8:12] != b"WEBP":
                continue
            return kind, mime
    if payload.startswith(b"PK"):
        return "document", "application/octet-stream"
    raise ValueError("type")


async def store_media(agent_id: int, filename: str, payload: bytes, description: str) -> dict:
    kind, mime = detect(payload)
    cap = MAX_BYTES.get(kind) or MAX_BYTES["document"]
    if len(payload) > cap:
        raise ValueError("too_large")
    if kind == "video" and not (description or "").strip():
        raise ValueError("video_description")
    key = generate_file_key(agent_id, kind, filename)
    upload_file(io.BytesIO(payload), key, mime, len(payload))
    text = (description or "").strip()
    if kind == "image" and not text:
        text = await _image_description(payload, mime)
    elif kind == "document" and not text:
        text = filename
    return {"kind": kind, "mime": mime, "key": key, "name": filename[:200], "description": text[:1000]}


async def _image_description(payload: bytes, mime: str) -> str:
    from backend.services.entities.ai import analyze_media_image

    encoded = base64.standard_b64encode(payload).decode("ascii")
    result = await analyze_media_image(encoded, mime)
    return (result or {}).get("description") or ""
