"""Inbound message pipeline — one stage per concern, executed in order.

Every stage opens and closes its own database session, so no connection is held
while the model is thinking or while a message is in flight to the channel.
"""
from backend.core.logger import log_error
from backend.services.messaging.pipeline import (
    account,
    aftercare,
    assemble,
    deliver,
    generate,
    intake,
    resolve,
)
from backend.services.messaging.pipeline.context import TurnContext, TurnRequest

__all__ = ["TurnRequest", "run_turn"]

THINKING_STATUS = "חושב"


async def run_turn(request: TurnRequest) -> None:
    """Handle one batch of inbound messages end to end."""
    ctx = await resolve.open_turn(request)
    if ctx is None:
        return

    try:
        if await intake.store_while_paused(ctx):
            return
        # Ahead of vision: an exhausted quota must not buy image understanding.
        if await account.quota_exhausted(ctx):
            return

        await intake.absorb(ctx)
        await ctx.outbound.emit_status(ctx.phone, THINKING_STATUS)

        reply = await generate.reply(ctx, assemble.model_inputs(ctx))
        if reply is None:
            return

        account.record(ctx, reply)
        try:
            await deliver.send(ctx, reply)
        except Exception as error:
            log_error("pipeline", f"deliver failed: {str(error)[:120]}")
        try:
            await aftercare.run(ctx)
        except Exception as error:
            log_error("pipeline", f"aftercare failed: {str(error)[:80]}")
    finally:
        await _clear_status(ctx)


async def _clear_status(ctx: TurnContext) -> None:
    """Sole owner of clearing the indicator, so it cannot stay stuck on failure."""
    try:
        await ctx.outbound.emit_status(ctx.phone, None)
    except Exception as error:
        log_error("pipeline", f"status clear failed: {str(error)[:80]}")
