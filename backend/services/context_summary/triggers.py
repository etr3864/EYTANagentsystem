"""Trigger logic for context summary generation."""
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.models.message import Message
from backend.models.agent import Agent
from backend.models.conversation_context_summary import ConversationContextSummary
from backend.core.context_windows import get_safe_context_limit, estimate_tokens
from backend.services.context_summary.config import get_context_summary_config

SYSTEM_PROMPT_TOKEN_BUFFER = 4000


def should_trigger_summary(db: Session, agent: Agent, conversation_id: int) -> bool:
    config = get_context_summary_config(agent)
    if not config["enabled"]:
        return False

    summary = db.query(ConversationContextSummary).filter(
        ConversationContextSummary.conversation_id == conversation_id
    ).first()

    last_covered_id = summary.last_message_id_covered if summary else 0

    new_count = db.query(func.count(Message.id)).filter(
        Message.conversation_id == conversation_id,
        Message.id > last_covered_id
    ).scalar() or 0

    if new_count >= config["message_threshold"]:
        return True

    return _approaching_context_limit(db, agent, conversation_id, summary, new_count)


def _approaching_context_limit(
    db: Session,
    agent: Agent,
    conversation_id: int,
    summary: ConversationContextSummary | None,
    new_msg_count: int,
) -> bool:
    safe_limit = get_safe_context_limit(agent.model)

    summary_tokens = estimate_tokens(summary.summary_text) if summary else 0

    recent_messages = db.query(Message.content).filter(
        Message.conversation_id == conversation_id,
        Message.id > (summary.last_message_id_covered if summary else 0)
    ).all()

    messages_tokens = sum(estimate_tokens(m.content or "") for m in recent_messages)
    total = summary_tokens + messages_tokens + SYSTEM_PROMPT_TOKEN_BUFFER

    return total >= safe_limit
