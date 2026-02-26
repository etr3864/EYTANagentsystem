"""Execute context summary generation via LLM."""
from sqlalchemy.orm import Session

from backend.models.agent import Agent
from backend.models.conversation_context_summary import ConversationContextSummary
from backend.services import agents as agents_service
from backend.services.llm import get_provider
from backend.services.context_summary.config import get_context_summary_config
from backend.services.context_summary.builder import (
    should_do_full_summary,
    build_summary_prompt,
    get_last_message_id,
)
from backend.core.logger import log, log_error

SUMMARY_MAX_TOKENS = 2000


async def run_summary(db: Session, conversation_id: int, agent_id: int) -> None:
    agent = agents_service.get_by_id(db, agent_id)
    if not agent:
        log_error("CONTEXT_SUMMARY", f"agent {agent_id} not found")
        return

    config = get_context_summary_config(agent)
    if not config["enabled"]:
        return

    summary = db.query(ConversationContextSummary).filter(
        ConversationContextSummary.conversation_id == conversation_id
    ).first()

    is_full = should_do_full_summary(
        summary.incremental_count if summary else 0,
        config["full_summary_every"],
    )

    prompt = build_summary_prompt(db, conversation_id, summary, is_full)
    last_msg_id = get_last_message_id(db, conversation_id)
    if not last_msg_id:
        return

    provider = get_provider(agent.model, agent=agent)
    summary_text = await provider.generate_simple_response(
        prompt, model=agent.model, max_tokens=SUMMARY_MAX_TOKENS
    )

    if not summary_text or not summary_text.strip():
        raise ValueError("LLM returned empty summary")

    _save_summary(db, conversation_id, summary, summary_text.strip(), last_msg_id, is_full)

    log("CONTEXT_SUMMARY", agent=agent.name, conv=conversation_id,
        mode="full" if is_full else "incremental")


def _save_summary(
    db: Session,
    conversation_id: int,
    existing: ConversationContextSummary | None,
    summary_text: str,
    last_message_id: int,
    is_full: bool,
) -> None:
    if existing:
        existing.summary_text = summary_text
        existing.last_message_id_covered = last_message_id
        existing.incremental_count = 0 if is_full else existing.incremental_count + 1
    else:
        db.add(ConversationContextSummary(
            conversation_id=conversation_id,
            summary_text=summary_text,
            last_message_id_covered=last_message_id,
            incremental_count=1,
        ))
    db.commit()
