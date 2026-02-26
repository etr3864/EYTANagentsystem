"""Build conversation history with context summary for LLM calls."""
from sqlalchemy.orm import Session

from backend.models.message import Message
from backend.models.conversation_context_summary import ConversationContextSummary
from backend.services.context_summary.config import get_context_summary_config

from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from backend.models.agent import Agent


def get_history_with_summary(
    db: Session,
    conversation_id: int,
    agent: "Agent",
    pending_count: int,
) -> list[dict] | None:
    """Build history using context summary if available.

    Returns list[dict] in same format as messages.get_history,
    or None if no summary exists (caller should fall back to normal history).
    """
    summary = db.query(ConversationContextSummary).filter(
        ConversationContextSummary.conversation_id == conversation_id
    ).first()

    if not summary or not summary.summary_text:
        return None

    config = get_context_summary_config(agent)
    messages_after = config["messages_after_summary"]

    recent = _get_messages_after(db, conversation_id, summary.last_message_id_covered)

    if pending_count > 0 and len(recent) >= pending_count:
        recent = recent[:-pending_count]

    if len(recent) > messages_after:
        recent = recent[-messages_after:]

    updated_at_iso = summary.updated_at.isoformat() if summary.updated_at else None

    history = [
        {
            "role": "user",
            "content": f"[סיכום שיחה קודמת]:\n{summary.summary_text}",
            "message_type": "text",
            "created_at": updated_at_iso,
        },
        {
            "role": "assistant",
            "content": "קראתי את סיכום השיחה. אמשיך בהתאם.",
            "message_type": "text",
            "created_at": updated_at_iso,
        },
    ]
    history.extend(recent)
    return history


def _get_messages_after(
    db: Session, conversation_id: int, after_message_id: int
) -> list[dict]:
    msgs = db.query(Message).filter(
        Message.conversation_id == conversation_id,
        Message.id > after_message_id
    ).order_by(Message.created_at).all()

    return [
        {
            "role": m.role,
            "content": m.content,
            "message_type": m.message_type or "text",
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in msgs
    ]
