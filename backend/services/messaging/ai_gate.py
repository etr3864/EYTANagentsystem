from sqlalchemy.orm import Session

from backend.services.entities import conversations, users


def should_understand(db: Session, agent, identity: str) -> bool:
    """False when the model must not spend tokens on this inbound.

    Agent off or this chat paused: keep the file in the inbox, skip STT / vision / LLM.
    Unknown identity with an active agent is a new chat — understand it.
    """
    if not agent or not agent.is_active:
        return False
    user = users.get_by_phone(db, identity)
    if not user:
        return True
    conv = conversations.get_live(db, agent.id, user.id)
    return not (conv and conv.is_paused)
