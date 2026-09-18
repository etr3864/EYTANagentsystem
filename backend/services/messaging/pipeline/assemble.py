"""Gather the read-only material the model call needs, then release the connection."""
from sqlalchemy.orm import Session

from backend.core.config import settings
from backend.core.database import SessionLocal
from backend.services import knowledge
from backend.services.entities import ai
from backend.services.messaging import messages
from backend.services.messaging.pipeline.context import PromptInputs, TurnContext
from backend.services.messaging.visibility import filter_history_for_llm
from backend.services.scheduling import appointments


def model_inputs(ctx: TurnContext) -> PromptInputs:
    """One short read transaction — nothing here is held during the model call."""
    with SessionLocal() as db:
        function_runtime, extra_tools = _tools(db, ctx)
        return PromptInputs(
            history=_history(db, ctx),
            knowledge_context=knowledge.get_context(db, ctx.agent_id),
            media_context=ai.build_media_context(
                db, ctx.agent_id, ctx.agent.media_config
            ),
            user_appointments=_user_appointments(db, ctx),
            calendar_config=_calendar_config(ctx) or None,
            extra_tools=extra_tools,
            function_runtime=function_runtime,
        )


def _history(db: Session, ctx: TurnContext) -> list[dict]:
    """Prior turns for the model — a context summary when one is available."""
    from backend.services.context_summary.history import get_history_with_summary

    batch_size = len(ctx.pending)
    rows = get_history_with_summary(db, ctx.conversation_id, ctx.agent, batch_size)
    if rows is None:
        rows = messages.get_history(
            db, ctx.conversation_id, limit=ctx.max_history + batch_size
        )
        rows = rows[:-batch_size]
        if len(rows) > ctx.max_history:
            rows = rows[-ctx.max_history:]
    return filter_history_for_llm(rows)


def _user_appointments(db: Session, ctx: TurnContext) -> list:
    calendar = ctx.agent.calendar_config
    if not calendar or not calendar.get("google_tokens"):
        return []
    if ctx.caps.calendar_as_connected:
        return []
    return appointments.get_user_appointments(db, ctx.agent_id, ctx.user_id)


def _calendar_config(ctx: TurnContext) -> dict:
    config = dict(ctx.agent.calendar_config or {})
    if not ctx.caps.calendar_as_connected:
        return config
    config["playground"] = True
    if not config.get("working_hours"):
        from backend.services.scheduling.appointments import DEFAULT_WORKING_HOURS

        config["working_hours"] = DEFAULT_WORKING_HOURS
    return config


def _tools(db: Session, ctx: TurnContext) -> tuple[object | None, list]:
    runtime = None
    tools: list = []
    if settings.agent_functions_enabled:
        from backend.services.agent_functions.runtime import ConversationRuntime

        runtime = ConversationRuntime(ctx.agent_id, ctx.user_id, ctx.conversation_id)
        tools = runtime.llm_tools(db)
    if ctx.caps.escalation_tools:
        from backend.services.escalation.tools import llm_tools as escalation_tools

        tools = tools + escalation_tools(db, ctx.agent_id)
    return runtime, tools
