"""Token accounting: agent totals, daily aggregates and playground quota."""
from sqlalchemy.orm import Session

from backend.core.database import SessionLocal
from backend.services.entities.usage_tracking import record_usage
from backend.services.llm.catalog import conversation_model
from backend.services.messaging.pipeline.context import ModelReply, TurnContext

VISION_MODEL = "claude-haiku-4-5"


async def quota_exhausted(ctx: TurnContext) -> bool:
    """Playground links carry a token budget — refuse the turn once it is spent."""
    if not ctx.is_playground:
        return False

    from backend.services.playground import quota, repo
    from backend.services.playground.constants import CLOSED_MESSAGE

    with SessionLocal() as db:
        link = repo.get(db, ctx.playground_link_id)
        spent = bool(link) and quota.would_exceed(link, 1)

    if not spent:
        return False

    await ctx.outbound.send_message(ctx.phone, CLOSED_MESSAGE)
    return True


def record(ctx: TurnContext, reply: ModelReply) -> None:
    """Persist this turn's usage in one short transaction."""
    used_model = conversation_model(ctx.agent.model, ctx.has_images)
    usage = reply.usage

    with SessionLocal() as db:
        record_usage(
            db,
            ctx.agent_id,
            used_model,
            ctx.caps.usage_source,
            usage["input_tokens"],
            usage["output_tokens"],
            usage["cache_read_tokens"],
            usage["cache_creation_tokens"],
        )
        _charge_playground(db, ctx, usage)
        _record_vision(db, ctx)
        db.commit()


def _charge_playground(db: Session, ctx: TurnContext, usage: dict) -> None:
    if not ctx.is_playground:
        return

    from backend.services.playground import quota

    quota.add_usage(
        db,
        ctx.playground_link_id,
        int(usage["input_tokens"]) + int(usage["output_tokens"]),
    )


def _record_vision(db: Session, ctx: TurnContext) -> None:
    if ctx.vision_usage["input_tokens"] <= 0:
        return
    record_usage(
        db,
        ctx.agent_id,
        VISION_MODEL,
        ctx.caps.usage_source,
        ctx.vision_usage["input_tokens"],
        ctx.vision_usage["output_tokens"],
        0,
        0,
    )
