from sqlalchemy.orm import Session
from backend.models.message import Message


def add(
    db: Session,
    conversation_id: int,
    role: str,
    content: str,
    message_type: str = "text",
    media_id: int | None = None,
    media_url: str | None = None,
    media_too_large: bool = False,
    reply_to_text: str | None = None,
    provider_msg_id: str | None = None,
    sender_name: str | None = None,
    sender_phone: str | None = None,
) -> Message:
    msg = Message(
        conversation_id=conversation_id,
        role=role,
        content=content,
        message_type=message_type,
        media_id=media_id,
        media_url=media_url,
        media_too_large=media_too_large,
        reply_to_text=reply_to_text,
        provider_msg_id=provider_msg_id,
        sender_name=sender_name,
        sender_phone=sender_phone,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def add_no_commit(
    db: Session,
    conversation_id: int,
    role: str,
    content: str,
    message_type: str = "text",
    media_id: int | None = None,
    media_url: str | None = None,
    media_too_large: bool = False,
    reply_to_text: str | None = None,
    provider_msg_id: str | None = None,
    sender_name: str | None = None,
    sender_phone: str | None = None,
) -> Message:
    msg = Message(
        conversation_id=conversation_id,
        role=role,
        content=content,
        message_type=message_type,
        media_id=media_id,
        media_url=media_url,
        media_too_large=media_too_large,
        reply_to_text=reply_to_text,
        provider_msg_id=provider_msg_id,
        sender_name=sender_name,
        sender_phone=sender_phone,
    )
    db.add(msg)
    return msg


def get_history(db: Session, conversation_id: int, limit: int | None = None) -> list[dict]:
    query = db.query(Message).filter(
        Message.conversation_id == conversation_id
    )
    if limit:
        query = query.order_by(Message.created_at.desc(), Message.id.desc()).limit(limit)
        msgs = query.all()
        msgs.reverse()
    else:
        msgs = query.order_by(Message.created_at, Message.id).all()

    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "message_type": m.message_type or "text",
            "media_url": m.media_url,
            "media_too_large": bool(m.media_too_large),
            "reply_to_text": m.reply_to_text,
            "sender_name": m.sender_name,
            "sender_phone": m.sender_phone,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in msgs
    ]


def get_by_conversation(db: Session, conversation_id: int, limit: int = 50) -> list[Message]:
    """Get recent messages for a conversation (newest first).
    
    Args:
        db: Database session
        conversation_id: Conversation ID
        limit: Max messages to return
    
    Returns:
        List of Message objects, newest first
    """
    return db.query(Message).filter(
        Message.conversation_id == conversation_id
    ).order_by(Message.created_at.desc()).limit(limit).all()


def set_provider_msg_id(db: Session, message_id: int, provider_msg_id: str) -> None:
    row = db.query(Message).filter(Message.id == message_id).first()
    if not row or not provider_msg_id:
        return
    row.provider_msg_id = str(provider_msg_id)[:120]
    db.commit()
