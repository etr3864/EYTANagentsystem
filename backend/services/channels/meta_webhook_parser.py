"""Meta webhook payload normalizer.

Parses incoming webhook payloads from Instagram, Messenger, and WhatsApp Meta
into a unified ParsedIncomingMessage structure for the message pipeline.

Handles:
- Echo filtering (messages sent BY the agent — ignored)
- BSUID extraction (WhatsApp Meta 2026)
- Story replies, mentions (Instagram)
- message_id for deduplication
"""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ParsedIncomingMessage:
    """Normalized message from any Meta channel."""
    channel_type: str          # "instagram" | "messenger" | "whatsapp_meta"
    external_account_id: str   # IG account ID / Page ID / phone_number_id
    external_user_id: str      # Sender IG user ID / PSID / phone number
    message_id: str            # Unique ID for deduplication
    text: str                  # Message text (empty for media-only)
    msg_type: str              # "text" | "image" | "audio" | "video" | "story_reply" | "mention"
    is_echo: bool              # True = sent BY the business — must be ignored
    bsuid: Optional[str] = None         # WhatsApp BSUID (2026 API)
    display_name: Optional[str] = None
    media_url: Optional[str] = None
    mime_type: Optional[str] = None
    # Extra data (story reply context, mention thread, etc.)
    extra: dict = field(default_factory=dict)


def parse_instagram_payload(payload: dict) -> list[ParsedIncomingMessage]:
    """Parse Instagram webhook payload (object = 'instagram')."""
    from backend.core.logger import log
    results = []
    for entry in payload.get("entry", []):
        ig_account_id = entry.get("id", "")
        messaging = entry.get("messaging", [])
        for msg_event in messaging:
            event_keys = [k for k in msg_event.keys() if k not in ("sender", "recipient", "timestamp")]
            log("ig_webhook_event", ig_id=ig_account_id, event_types=event_keys,
                has_message="message" in msg_event)
            parsed = _parse_ig_messaging_event(ig_account_id, msg_event)
            if parsed:
                results.append(parsed)
        if not messaging:
            log("ig_webhook_event", ig_id=ig_account_id, note="no messaging array",
                entry_keys=list(entry.keys()))
    return results


def parse_messenger_payload(payload: dict) -> list[ParsedIncomingMessage]:
    """Parse Messenger webhook payload (object = 'page')."""
    results = []
    for entry in payload.get("entry", []):
        page_id = entry.get("id", "")
        for msg_event in entry.get("messaging", []):
            parsed = _parse_messenger_event(page_id, msg_event)
            if parsed:
                results.append(parsed)
    return results


def parse_whatsapp_payload(payload: dict) -> list[ParsedIncomingMessage]:
    """Parse WhatsApp Business webhook payload (object = 'whatsapp_business_account')."""
    results = []
    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") != "messages":
                continue
            value = change.get("value", {})
            phone_number_id = value.get("metadata", {}).get("phone_number_id", "")

            # Build contact lookup for display names
            contacts = {c["wa_id"]: c.get("profile", {}).get("name") for c in value.get("contacts", [])}

            for msg in value.get("messages", []):
                parsed = _parse_wa_message(phone_number_id, msg, contacts)
                if parsed:
                    results.append(parsed)
    return results


# ── Internal parsers ──────────────────────────────────────────────────────────

def _parse_ig_messaging_event(ig_account_id: str, event: dict) -> Optional[ParsedIncomingMessage]:
    sender_id = event.get("sender", {}).get("id", "")
    recipient_id = event.get("recipient", {}).get("id", "")

    # Echo: sender == ig_account_id (the business sent it)
    is_echo = (sender_id == ig_account_id)

    msg = event.get("message", {})
    if not msg:
        return None  # Delivery / read receipts etc.

    msg_id = msg.get("mid", "")
    text = msg.get("text", "")
    msg_type = "text"
    media_url = None
    mime_type = None
    extra = {}

    # Story reply
    if "reply_to" in msg and msg["reply_to"].get("story"):
        msg_type = "story_reply"
        extra["story_url"] = msg["reply_to"]["story"].get("url")

    # Image / video attachments
    attachments = msg.get("attachments", [])
    if attachments:
        att = attachments[0]
        att_type = att.get("type", "")
        if att_type in ("image", "video", "audio"):
            msg_type = att_type
            media_url = att.get("payload", {}).get("url")

    return ParsedIncomingMessage(
        channel_type="instagram",
        external_account_id=ig_account_id,
        external_user_id=sender_id,
        message_id=msg_id or f"ig_{sender_id}_{event.get('timestamp', '')}",
        text=text,
        msg_type=msg_type,
        is_echo=is_echo,
        media_url=media_url,
        mime_type=mime_type,
        extra=extra,
    )


def _parse_messenger_event(page_id: str, event: dict) -> Optional[ParsedIncomingMessage]:
    sender_id = event.get("sender", {}).get("id", "")
    is_echo = event.get("message", {}).get("is_echo", False)

    msg = event.get("message", {})
    if not msg:
        return None

    msg_id = msg.get("mid", "")
    text = msg.get("text", "")
    msg_type = "text"
    media_url = None

    attachments = msg.get("attachments", [])
    if attachments:
        att = attachments[0]
        att_type = att.get("type", "")
        if att_type in ("image", "video", "audio", "file"):
            msg_type = att_type if att_type != "file" else "document"
            media_url = att.get("payload", {}).get("url")

    return ParsedIncomingMessage(
        channel_type="messenger",
        external_account_id=page_id,
        external_user_id=sender_id,
        message_id=msg_id or f"ms_{sender_id}_{event.get('timestamp', '')}",
        text=text,
        msg_type=msg_type,
        is_echo=is_echo,
        media_url=media_url,
    )


def _parse_wa_message(phone_number_id: str, msg: dict, contacts: dict) -> Optional[ParsedIncomingMessage]:
    msg_type_raw = msg.get("type", "text")
    msg_id = msg.get("id", "")
    from_phone = msg.get("from", "")
    bsuid = msg.get("from_user_id") or msg.get("user_id")  # 2026 BSUID

    text = ""
    msg_type = "text"
    media_url = None
    mime_type = None

    if msg_type_raw == "text":
        text = msg.get("text", {}).get("body", "")
        msg_type = "text"
    elif msg_type_raw == "image":
        text = "[תמונה]"
        msg_type = "image"
        media_url = msg.get("image", {}).get("link")
        mime_type = msg.get("image", {}).get("mime_type")
    elif msg_type_raw == "audio":
        text = "[הודעה קולית]"
        msg_type = "audio"
        media_url = msg.get("audio", {}).get("link")
    elif msg_type_raw == "video":
        text = "[וידאו]"
        msg_type = "video"
        media_url = msg.get("video", {}).get("link")
    elif msg_type_raw == "document":
        text = "[קובץ]"
        msg_type = "document"
        media_url = msg.get("document", {}).get("link")
    elif msg_type_raw == "identity":
        # Identity change event — not a user message, handled separately
        return None
    else:
        text = f"[{msg_type_raw}]"
        msg_type = msg_type_raw

    display_name = contacts.get(from_phone)

    return ParsedIncomingMessage(
        channel_type="whatsapp_meta",
        external_account_id=phone_number_id,
        external_user_id=from_phone,
        message_id=msg_id,
        text=text,
        msg_type=msg_type,
        is_echo=False,  # WA Meta echoes have different structure; filtered at entry
        bsuid=bsuid,
        display_name=display_name,
        media_url=media_url,
        mime_type=mime_type,
    )
