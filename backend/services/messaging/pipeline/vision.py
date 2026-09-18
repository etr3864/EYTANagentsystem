"""Image and video understanding for buffered inbound media."""
from backend.services.entities import ai
from backend.services.messaging.buffer import PendingMessage

MEDIA_PLACEHOLDERS = frozenset({"[תמונה]", "[וידאו]"})

VISUAL_TYPES = ("image", "video")


def customer_caption(text: str) -> str:
    """The caption the customer typed — never the vision line we compose later.

    Inbound text is the caption or a placeholder. After vision we store
    '[תמונה]: {desc}\\n{caption}'. Called only on inbound, before describe.
    """
    raw = (text or "").strip()
    if not raw or raw in MEDIA_PLACEHOLDERS:
        return ""
    if raw.startswith("[קובץ גדול מדי]"):
        parts = raw.split("\n", 1)
        return parts[1].strip() if len(parts) > 1 else ""
    # Old wasender video wrap: "[וידאו]: caption" before vision ran.
    if raw.startswith("[וידאו]: "):
        rest = raw.split("\n", 1)
        return rest[1].strip() if len(rest) > 1 else rest[0][len("[וידאו]: "):].strip()
    if raw.startswith("[תמונה]: "):
        rest = raw.split("\n", 1)
        return rest[1].strip() if len(rest) > 1 else ""
    return raw


def compose_content(kind: str, description: str, caption: str) -> str:
    prefix = "[תמונה]" if kind == "image" else "[וידאו]"
    line = f"{prefix}: {description}"
    return f"{line}\n{caption}" if caption else line


def _vision_media_type(msg: PendingMessage) -> str:
    """Claude only accepts image/* — video frames are always JPEG."""
    from backend.services.media import get_media_type_from_mime

    if msg.msg_type == "video":
        return "image/jpeg"
    return get_media_type_from_mime(msg.media_type or "image/jpeg")


async def describe_pending(
    pending: list[PendingMessage], agent,
) -> tuple[bool, dict]:
    """Run vision on buffered image/video, keep caption on a separate line.

    Mutates msg.text in place so the model turn and the saved row match.
    describe_image never raises — fallback description is 'תמונה'.
    """
    has_images = False
    usage = {"input_tokens": 0, "output_tokens": 0}
    for msg in pending:
        if msg.msg_type not in VISUAL_TYPES or not msg.image_base64:
            continue
        has_images = True
        caption = customer_caption(msg.text)
        description, desc_usage = await ai.describe_image(
            msg.image_base64, _vision_media_type(msg), agent=agent,
        )
        usage["input_tokens"] += desc_usage.get("input_tokens", 0)
        usage["output_tokens"] += desc_usage.get("output_tokens", 0)
        msg.text = compose_content(msg.msg_type, description, caption)
    return has_images, usage
