"""Work scheduled after the customer has the reply."""
from backend.core.channel_types import get_capabilities
from backend.core.database import SessionLocal
from backend.core.logger import log_error
from backend.services.messaging.pipeline.context import TurnContext

FALLBACK_CHANNEL_TYPE = "whatsapp_wasender"


async def run(ctx: TurnContext) -> None:
    channel_type = ctx.conversation.channel_type_snapshot or FALLBACK_CHANNEL_TYPE
    if get_capabilities(channel_type).get("followups", True):
        await _schedule_followup(ctx)
    _enqueue_context_summary(ctx)


async def _schedule_followup(ctx: TurnContext) -> None:
    from backend.services.engagement.followups import get_config, set_followup_timer

    config = get_config(ctx.agent)
    if not config.get("enabled"):
        return
    sequence = config.get("sequence", [])
    if not sequence:
        return
    await set_followup_timer(ctx.agent_id, ctx.conversation_id, sequence[0]["delay_hours"])


def _enqueue_context_summary(ctx: TurnContext) -> None:
    try:
        from backend.services.context_summary.triggers import should_trigger_summary

        with SessionLocal() as db:
            if not should_trigger_summary(db, ctx.agent, ctx.conversation_id):
                return

        from backend.tasks.context_summary import run_context_summary_task

        run_context_summary_task.delay(ctx.conversation_id, ctx.agent_id)
    except Exception as error:
        log_error("CONTEXT_SUMMARY", f"enqueue failed: {str(error)[:80]}")
