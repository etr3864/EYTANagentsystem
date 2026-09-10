from contextlib import contextmanager
from typing import Iterator

from sqlalchemy.orm import Session

from backend.auth import mcp_tokens
from backend.auth.models import AuthUser, UserRole
from backend.auth import service as auth_service
from backend.core.database import SessionLocal
from backend.services.entities import agents as agents_service
from backend.services.engagement.summaries import get_summary_config

try:
    from fastmcp.exceptions import ToolError
except ImportError:  # pragma: no cover
    class ToolError(Exception):
        pass


def fail(message: str) -> ToolError:
    return ToolError(message)


@contextmanager
def db_session() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _bearer_token() -> str:
    raw = ""
    try:
        from fastmcp.server.dependencies import get_http_request
        request = get_http_request()
        raw = request.headers.get("authorization") or request.headers.get("Authorization") or ""
    except Exception:
        try:
            from fastmcp.server.dependencies import get_http_headers
            headers = get_http_headers(include={"authorization"}) or {}
            raw = headers.get("authorization") or headers.get("Authorization") or ""
        except Exception:
            return ""
    if not isinstance(raw, str):
        return ""
    if raw.lower().startswith("bearer "):
        return raw[7:].strip()
    return raw.strip()


def current_user(db: Session) -> AuthUser:
    user = mcp_tokens.authenticate(db, _bearer_token())
    if not user:
        raise fail("לא מאומת. טוקן MCP זמין למנהל ראשי בלבד.")
    return user


def require_agent(db: Session, user: AuthUser, agent_id: int):
    if not auth_service.can_access_agent(db, user, agent_id):
        raise fail("אין גישה לסוכן הזה")
    agent = agents_service.get_by_id(db, agent_id)
    if not agent:
        raise fail("סוכן לא נמצא")
    return agent


def require_super(user: AuthUser) -> None:
    if user.role != UserRole.SUPER_ADMIN:
        raise fail("פעולה זו זמינה למנהל ראשי בלבד")


def require_admin(user: AuthUser) -> None:
    if user.role not in (UserRole.SUPER_ADMIN, UserRole.ADMIN):
        raise fail("פעולה זו זמינה למנהל או ללקוח בלבד")


def require_confirm(confirm: bool, action: str) -> None:
    if not confirm:
        raise fail(f"כדי לבצע {action} צריך confirm=true")


def public_agent(agent) -> dict:
    calendar = dict(agent.calendar_config or {})
    tokens = calendar.pop("google_tokens", None)
    calendar["google_connected"] = bool(tokens)
    channels = getattr(agent, "channels", None) or []
    return {
        "id": agent.id,
        "name": agent.name,
        "system_prompt": agent.system_prompt,
        "appointment_prompt": agent.appointment_prompt,
        "model": agent.model,
        "thinking_level": getattr(agent, "thinking_level", None) or "off",
        "is_active": agent.is_active,
        "provider": agent.provider or "meta",
        "batching_config": agent.batching_config,
        "calendar": calendar,
        "media_config": agent.media_config,
        "followup_config": agent.followup_config,
        "summary_config": get_summary_config(agent),
        "context_summary_config": agent.context_summary_config,
        "max_tool_rounds": getattr(agent, "max_tool_rounds", 5) or 5,
        "business_assistant_mode": getattr(agent, "business_assistant_mode", False),
        "active_channel_types": [
            ch.channel_type for ch in channels if getattr(ch, "is_active", False)
        ],
        "created_at": agent.created_at.isoformat() if agent.created_at else None,
        "updated_at": agent.updated_at.isoformat() if agent.updated_at else None,
    }


def agent_summary(agent) -> dict:
    return {
        "id": agent.id,
        "name": agent.name,
        "is_active": agent.is_active,
        "model": agent.model,
        "provider": agent.provider or "meta",
    }
