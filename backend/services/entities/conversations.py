from sqlalchemy.orm import Session
from backend.models.conversation import Conversation


def get_by_id(db: Session, conversation_id: int) -> Conversation | None:
    return db.query(Conversation).filter(Conversation.id == conversation_id).first()


def get_or_create(db: Session, agent_id: int, user_id: int) -> Conversation:
    conv = db.query(Conversation).filter(
        Conversation.agent_id == agent_id,
        Conversation.user_id == user_id
    ).first()

    if not conv:
        conv = Conversation(agent_id=agent_id, user_id=user_id)
        db.add(conv)
        db.commit()
        db.refresh(conv)

    return conv


def get_by_agent(db: Session, agent_id: int) -> list[Conversation]:
    return db.query(Conversation).filter(
        Conversation.agent_id == agent_id
    ).order_by(Conversation.updated_at.desc()).all()


def delete(db: Session, conversation_id: int) -> bool:
    """Delete conversation, messages, and conversation-scoped R2 files."""
    from backend.models.message import Message
    from backend.services.media.inbox import delete_stored_urls

    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        return False

    rows = db.query(Message.media_url).filter(
        Message.conversation_id == conversation_id,
        Message.media_url.isnot(None),
    ).all()
    delete_stored_urls([row[0] for row in rows])

    db.query(Message).filter(Message.conversation_id == conversation_id).delete()
    db.delete(conv)
    db.commit()
    return True


def set_paused(db: Session, conversation_id: int, paused: bool) -> Conversation | None:
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        return None
    conv.is_paused = paused
    db.commit()
    db.refresh(conv)
    return conv


def set_opted_out(db: Session, conversation_id: int, opted_out: bool) -> Conversation | None:
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        return None
    conv.opted_out = opted_out
    db.commit()
    db.refresh(conv)
    return conv


def get_by_agent_and_user(db: Session, agent_id: int, user_id: int) -> Conversation | None:
    return db.query(Conversation).filter(
        Conversation.agent_id == agent_id,
        Conversation.user_id == user_id
    ).first()
