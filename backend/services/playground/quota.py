from sqlalchemy import update
from sqlalchemy.orm import Session

from backend.models.playground_link import PlaygroundLink


def would_exceed(link, upcoming: int) -> bool:
    """Call before the LLM. upcoming = estimated tokens for this turn."""
    used = int(getattr(link, "tokens_used", 0) or 0)
    limit = int(getattr(link, "token_limit", 0) or 0)
    if not limit:
        return False
    return used + max(0, int(upcoming)) > limit


def add_usage(db: Session, link_id: int, amount: int) -> None:
    """Increment in SQL — concurrent turns on one link must not lose tokens."""
    tokens = max(0, int(amount))
    if not tokens:
        return
    db.execute(
        update(PlaygroundLink)
        .where(PlaygroundLink.id == link_id)
        .values(tokens_used=PlaygroundLink.tokens_used + tokens)
    )
