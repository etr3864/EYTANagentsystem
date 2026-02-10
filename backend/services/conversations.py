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
    """Delete conversation and its messages."""
    from backend.models.message import Message
    
    db.query(Message).filter(Message.conversation_id == conversation_id).delete()
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if conv:
        db.delete(conv)
        db.commit()
        return True
    return False


def set_paused(db: Session, conversation_id: int, paused: bool) -> Conversation | None:
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        return None
    conv.is_paused = paused
    db.commit()
    db.refresh(conv)
    return conv


def get_by_agent_and_user(db: Session, agent_id: int, user_id: int) -> Conversation | None:
    return db.query(Conversation).filter(
        Conversation.agent_id == agent_id,
        Conversation.user_id == user_id
    ).first()
