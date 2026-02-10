from backend.api.schemas import WebhookPayload


def extract_message(payload: WebhookPayload) -> tuple[str, str, str, str | None, str, str | None] | None:
    """
    Extract message from webhook payload.
    
    Returns: (phone_number_id, user_phone, content, user_name, msg_type, mime_type) or None
    - msg_type: "text", "audio", or "image"
    - content: text body for text messages, media_id for audio/image messages
    - mime_type: MIME type for media messages (audio/image)
    """
    for entry in payload.entry:
        for change in entry.changes:
            if change.field != "messages" or not change.value.messages:
                continue
            for msg in change.value.messages:
                # Get contact name if available
                user_name = None
                if change.value.contacts:
                    for contact in change.value.contacts:
                        if contact.wa_id == msg.from_ and contact.profile:
                            user_name = contact.profile.name
                            break
                
                # Text message
                if msg.type == "text" and msg.text:
                    return (
                        change.value.metadata.phone_number_id,
                        msg.from_,
                        msg.text.body,
                        user_name,
                        "text",
                        None,
                    )
                
                # Audio/voice message
                if msg.type == "audio" and msg.audio:
                    return (
                        change.value.metadata.phone_number_id,
                        msg.from_,
                        msg.audio.id,
                        user_name,
                        "audio",
                        msg.audio.mime_type,
                    )
                
                # Image message
                if msg.type == "image" and msg.image:
                    return (
                        change.value.metadata.phone_number_id,
                        msg.from_,
                        msg.image.id,
                        user_name,
                        "image",
                        msg.image.mime_type,
                    )
    return None
