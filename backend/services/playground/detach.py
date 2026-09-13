from sqlalchemy.orm import Session

from backend.models.conversation import Conversation
from backend.models.playground_link import PlaygroundLink


def detach_from_agent(db: Session, agent_id: int) -> None:
    """Keep playground archive when an agent row is deleted (CASCADE would wipe it)."""
    db.query(PlaygroundLink).filter(PlaygroundLink.agent_id == agent_id).update(
        {PlaygroundLink.agent_id: None},
        synchronize_session="fetch",
    )
    db.query(Conversation).filter(
        Conversation.agent_id == agent_id,
        Conversation.playground_link_id.isnot(None),
    ).update(
        {Conversation.agent_id: None},
        synchronize_session="fetch",
    )
