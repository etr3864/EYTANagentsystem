"""JSON export for playground conversations — feed an LLM, no internal IDs."""
import json

from backend.services.playground.constants import HIDDEN_MESSAGE_TYPES
from backend.services.playground.identity import claimed_name, claimed_phone


def export_conversation(db, conv, user, link) -> dict:
    from backend.models.conversation_context_summary import ConversationContextSummary
    from backend.services.playground import repo

    rows = repo.messages_for_conversation(db, conv.id)
    summary = (
        db.query(ConversationContextSummary)
        .filter(ConversationContextSummary.conversation_id == conv.id)
        .first()
    )
    return {
        "meta": {
            "agent_name": link.agent_name_snapshot,
            "tester_name": claimed_name(user),
            "tester_phone": claimed_phone(user),
            "started_at": _iso(conv.created_at),
            "ended_at": _iso(conv.archived_at or conv.updated_at),
            "archived": conv.archived_at is not None,
        },
        "session_boundary": _boundary(conv),
        "context_summary": summary.summary_text if summary else None,
        "turns": [_turn(row) for row in rows],
    }


def filename(_link, user, conv) -> str:
    stamp = conv.created_at or conv.updated_at
    day = stamp.strftime("%Y%m%d") if stamp else "export"
    phone = "".join(c for c in claimed_phone(user) if c.isdigit()) or "tester"
    return f"playground-{phone}-{day}.json"


def _iso(value):
    return value.isoformat() if value else None


def _boundary(conv) -> dict | None:
    if not conv.archived_at:
        return None
    return {"at": _iso(conv.archived_at), "reason": "reset"}


def _turn(row) -> dict:
    kind = row.message_type or "text"
    at = _iso(row.created_at)
    if kind in HIDDEN_MESSAGE_TYPES:
        call = _tool_call(kind, row.content)
        return {
            "role": "assistant",
            "content": None,
            "reply_to": None,
            "media": None,
            "tool_calls": [call],
            "latency_ms": call.get("latency_ms"),
            "at": at,
        }
    media = None
    if row.media_url:
        media = {"type": kind, "url": row.media_url}
    return {
        "role": row.role,
        "content": row.content,
        "reply_to": row.reply_to_text,
        "media": media,
        "tool_calls": [],
        "latency_ms": None,
        "at": at,
    }


def _tool_call(kind: str, content: str) -> dict:
    if kind == "function":
        parsed = _parse_function(content)
        if parsed:
            return parsed
    return {"name": kind, "result": content, "latency_ms": None}


def _parse_function(content: str) -> dict | None:
    try:
        data = json.loads(content)
    except (TypeError, ValueError):
        return None
    if not isinstance(data, dict) or not data.get("name"):
        return None
    return {
        "name": data["name"],
        "status": data.get("status"),
        "latency_ms": data.get("ms"),
        "result": data.get("body"),
        "error": data.get("error"),
    }
