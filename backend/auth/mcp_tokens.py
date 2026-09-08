import hashlib
import secrets
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.auth.models import AuthUser, McpToken, UserRole

TOKEN_PREFIX = "mcp_"
MAX_TOKENS_PER_USER = 10
_HASH_LEN = 64


def hash_secret(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _owned(db: Session, user_id: int, token_id: int) -> McpToken | None:
    return (
        db.query(McpToken)
        .filter(McpToken.id == token_id, McpToken.user_id == user_id)
        .first()
    )


def issue(db: Session, user: AuthUser, name: str) -> tuple[McpToken, str]:
    if user.role != UserRole.SUPER_ADMIN:
        raise ValueError("טוקן MCP זמין למנהל ראשי בלבד")
    cleaned = (name or "").strip()[:80] or "Cursor"
    count = db.query(McpToken).filter(McpToken.user_id == user.id).count()
    if count >= MAX_TOKENS_PER_USER:
        raise ValueError(f"מקסימום {MAX_TOKENS_PER_USER} טוקנים. מחק אחד קודם.")
    raw = TOKEN_PREFIX + secrets.token_urlsafe(32)
    row = McpToken(
        user_id=user.id,
        name=cleaned,
        token_hash=hash_secret(raw),
        prefix=raw[:12],
        paused=False,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row, raw


def list_for_user(db: Session, user_id: int) -> list[McpToken]:
    return (
        db.query(McpToken)
        .filter(McpToken.user_id == user_id)
        .order_by(McpToken.created_at.desc())
        .all()
    )


def patch(db: Session, user_id: int, token_id: int, name: str | None, paused: bool | None) -> McpToken | None:
    row = _owned(db, user_id, token_id)
    if not row:
        return None
    if name is not None:
        cleaned = name.strip()[:80]
        if not cleaned:
            raise ValueError("כותרת חובה")
        row.name = cleaned
    if paused is not None:
        row.paused = paused
    db.commit()
    db.refresh(row)
    return row


def revoke(db: Session, user_id: int, token_id: int) -> bool:
    row = _owned(db, user_id, token_id)
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True


def authenticate(db: Session, raw: str) -> AuthUser | None:
    if not raw or not raw.startswith(TOKEN_PREFIX) or len(raw) < 20:
        return None
    digest = hash_secret(raw)
    if len(digest) != _HASH_LEN:
        return None
    row = db.query(McpToken).filter(McpToken.token_hash == digest).first()
    if not row or row.paused:
        return None
    user = db.get(AuthUser, row.user_id)
    if not user or not user.is_active or user.role != UserRole.SUPER_ADMIN:
        return None
    stale = row.last_used_at is None or (datetime.utcnow() - row.last_used_at) > timedelta(hours=1)
    if stale:
        row.last_used_at = datetime.utcnow()
        db.add(row)
        db.commit()
        db.refresh(user)
    return user


def to_public(row: McpToken) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "prefix": row.prefix,
        "paused": bool(row.paused),
        "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
