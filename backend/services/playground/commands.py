from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.models.agent import Agent
from backend.models.playground_link import PlaygroundLink
from backend.services.playground.constants import ALLOWED_TTL, DEFAULT_TOKEN_LIMIT
from backend.services.playground import tokens


def _refresh_snapshot(link: PlaygroundLink, agent: Agent | None) -> None:
    if agent is not None:
        link.agent_name_snapshot = agent.name


def create(
    db: Session,
    *,
    agent: Agent,
    created_by: int,
    ttl_seconds: int,
    token_limit: int = DEFAULT_TOKEN_LIMIT,
) -> tuple[PlaygroundLink, str]:
    if ttl_seconds not in ALLOWED_TTL:
        raise ValueError("TTL לא נתמך")
    raw = tokens.issue_raw()
    now = datetime.utcnow()
    row = PlaygroundLink(
        agent_id=agent.id,
        agent_name_snapshot=agent.name,
        created_by=created_by,
        token_hash=tokens.hash_token(raw),
        token_encrypted=tokens.encrypt_token(raw),
        ttl_seconds=ttl_seconds,
        expires_at=now + timedelta(seconds=ttl_seconds),
        require_profile=True,
        token_limit=token_limit,
        tokens_used=0,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row, raw


def stop(db: Session, link: PlaygroundLink, agent: Agent | None) -> PlaygroundLink:
    if link.deleted_at:
        raise ValueError("קישור שנמחק לא ניתן לעצור")
    _refresh_snapshot(link, agent)
    link.stopped_at = datetime.utcnow()
    db.commit()
    db.refresh(link)
    return link


def restore(db: Session, link: PlaygroundLink, agent: Agent | None) -> tuple[PlaygroundLink, str]:
    if link.deleted_at:
        raise ValueError("קישור שנמחק לא ניתן לשחזר")
    if agent is None:
        raise ValueError("אין סוכן לשחזור הקישור")
    raw = tokens.issue_raw()
    now = datetime.utcnow()
    _refresh_snapshot(link, agent)
    link.token_hash = tokens.hash_token(raw)
    link.token_encrypted = tokens.encrypt_token(raw)
    link.stopped_at = None
    link.expires_at = now + timedelta(seconds=link.ttl_seconds)
    db.commit()
    db.refresh(link)
    return link, raw


def delete(db: Session, link: PlaygroundLink) -> PlaygroundLink:
    """URL dies. Transcripts stay."""
    if not link.deleted_at:
        link.deleted_at = datetime.utcnow()
        db.commit()
        db.refresh(link)
    return link
