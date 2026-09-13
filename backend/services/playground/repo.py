from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models.conversation import Conversation
from backend.models.playground_link import PlaygroundLink
from backend.models.user import User


def get(db: Session, link_id: int) -> PlaygroundLink | None:
    return db.query(PlaygroundLink).filter(PlaygroundLink.id == link_id).first()


def get_by_hash(db: Session, token_hash: str) -> PlaygroundLink | None:
    return db.query(PlaygroundLink).filter(PlaygroundLink.token_hash == token_hash).first()


def get_by_raw_token(db: Session, raw: str) -> PlaygroundLink | None:
    from backend.services.playground import tokens
    if not raw:
        return None
    return get_by_hash(db, tokens.hash_token(raw))


def live_conversation(db: Session, link_id: int, user_id: int) -> Conversation | None:
    return (
        db.query(Conversation)
        .filter(
            Conversation.playground_link_id == link_id,
            Conversation.user_id == user_id,
            Conversation.archived_at.is_(None),
        )
        .first()
    )


def list_for_agent(db: Session, agent_id: int) -> list[PlaygroundLink]:
    return (
        db.query(PlaygroundLink)
        .filter(PlaygroundLink.agent_id == agent_id)
        .order_by(PlaygroundLink.created_at.desc())
        .all()
    )


def conversation_counts(db: Session, link_ids: list[int]) -> dict[int, int]:
    if not link_ids:
        return {}
    rows = (
        db.query(Conversation.playground_link_id, func.count(Conversation.id))
        .filter(Conversation.playground_link_id.in_(link_ids))
        .group_by(Conversation.playground_link_id)
        .all()
    )
    return {int(link_id): int(n) for link_id, n in rows}


def tester_counts(db: Session, link_ids: list[int]) -> dict[int, int]:
    if not link_ids:
        return {}
    rows = (
        db.query(User.playground_link_id, func.count(User.id))
        .filter(User.playground_link_id.in_(link_ids))
        .group_by(User.playground_link_id)
        .all()
    )
    return {int(link_id): int(n) for link_id, n in rows}


def list_testers(db: Session, link_id: int) -> list[User]:
    return (
        db.query(User)
        .filter(User.playground_link_id == link_id)
        .order_by(User.created_at.desc(), User.id.desc())
        .all()
    )


def conversations_for_tester(db: Session, link_id: int, user_id: int) -> list[Conversation]:
    return (
        db.query(Conversation)
        .filter(
            Conversation.playground_link_id == link_id,
            Conversation.user_id == user_id,
        )
        .order_by(Conversation.created_at.asc(), Conversation.id.asc())
        .all()
    )


def conversation_for_link(db: Session, link_id: int, conversation_id: int) -> Conversation | None:
    return (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.playground_link_id == link_id,
        )
        .first()
    )


def messages_for_conversation(db: Session, conversation_id: int):
    from backend.models.message import Message

    return (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc(), Message.id.asc())
        .all()
    )


def tester_on_link(db: Session, link_id: int, user_id: int) -> User | None:
    return (
        db.query(User)
        .filter(User.id == user_id, User.playground_link_id == link_id)
        .first()
    )


def message_count_for_user(db: Session, link_id: int, user_id: int) -> int:
    from backend.models.message import Message

    return (
        db.query(func.count(Message.id))
        .join(Conversation, Conversation.id == Message.conversation_id)
        .filter(
            Conversation.playground_link_id == link_id,
            Conversation.user_id == user_id,
        )
        .scalar()
    ) or 0
