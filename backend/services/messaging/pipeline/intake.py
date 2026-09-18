"""Persist the customer's messages, running vision first when media arrived."""
from backend.core.database import SessionLocal
from backend.core.logger import log, log_message
from backend.services.messaging import messages
from backend.services.messaging.pipeline import vision
from backend.services.messaging.pipeline.context import TurnContext


async def store_while_paused(ctx: TurnContext) -> bool:
    """A paused agent still records what it was told, but never answers."""
    if not ctx.conversation.is_paused:
        return False
    _persist(ctx)
    log("PAUSED", agent=ctx.agent.name, user=ctx.display_name, msgs=len(ctx.pending))
    return True


async def absorb(ctx: TurnContext) -> None:
    """Describe any media, then store the batch as the customer's turn.

    Vision rewrites msg.text, so it has to run before the rows are written —
    the saved row and the text the model sees must match.
    """
    ctx.has_images, ctx.vision_usage = await vision.describe_pending(
        ctx.pending, ctx.agent
    )
    _persist(ctx)
    ctx.combined_text = "\n".join(msg.text for msg in ctx.pending)
    log_message(
        ctx.agent.name,
        ctx.display_name,
        ctx.combined_text,
        len(ctx.pending),
        ctx.has_images,
        provider=ctx.provider,
    )


async def append_batch(ctx: TurnContext, extra: list) -> None:
    """Customer typed during the model call — fold into this turn once."""
    if not extra:
        return
    has_images, usage = await vision.describe_pending(extra, ctx.agent)
    ctx.has_images = ctx.has_images or has_images
    ctx.vision_usage["input_tokens"] += usage.get("input_tokens", 0)
    ctx.vision_usage["output_tokens"] += usage.get("output_tokens", 0)
    original = list(ctx.pending)
    ctx.pending = extra
    _persist(ctx)
    ctx.pending = original + extra
    ctx.combined_text = "\n".join(msg.text for msg in ctx.pending)
    log_message(
        ctx.agent.name,
        ctx.display_name,
        ctx.combined_text,
        len(ctx.pending),
        ctx.has_images,
        provider=ctx.provider,
    )


def _persist(ctx: TurnContext) -> None:
    with SessionLocal() as db:
        for msg in ctx.pending:
            messages.add_no_commit(
                db,
                ctx.conversation_id,
                "user",
                msg.text,
                message_type=msg.msg_type,
                media_url=msg.media_url,
                media_too_large=msg.media_too_large,
                reply_to_text=msg.reply_to_text,
            )
        db.commit()
