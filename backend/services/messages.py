from sqlalchemy.orm import Session
from backend.models.message import Message


def add(
    db: Session,
    conversation_id: int,
    role: str,
    content: str,
    message_type: str = "text",
    media_id: int | None = None,
    media_url: str | None = None
) -> Message:
    """Add a message to conversation.
    
    Args:
        db: Database session
        conversation_id: Conversation ID
        role: 'user' or 'assistant'
        content: Message text content
        message_type: Type of message ('text', 'image', 'video', 'voice')
        media_id: Optional link to AgentMedia record
        media_url: Optional URL of the media file
    """
    msg = Message(
        conversation_id=conversation_id,
        role=role,
        content=content,
        message_type=message_type,
        media_id=media_id,
        media_url=media_url
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def get_history(db: Session, conversation_id: int) -> list[dict]:
    msgs = db.query(Message).filter(
        Message.conversation_id == conversation_id
    ).order_by(Message.created_at).all()
    return [
        {
            "role": m.role, 
            "content": m.content, 
            "message_type": m.message_type or "text",
            "created_at": m.created_at.isoformat() if m.created_at else None
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
