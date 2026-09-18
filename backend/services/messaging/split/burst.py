"""Send bubbles one by one with a real delay and typing in between."""
import asyncio

from backend.core.logger import log_error
from backend.services.messaging import buffer
from backend.services.messaging.pipeline.context import TurnContext
from backend.services.messaging.split.config import SplitConfig
from backend.services.messaging.split.gate import should_stop
from backend.services.messaging.split.leftover import save as save_leftover


async def send_parts(ctx: TurnContext, parts: list[str], cfg: SplitConfig, send_one) -> None:
    """send_one(text) -> bool. Remaining unsent parts go to leftover on abort."""
    pause = cfg.delay_seconds > 0
    for index, part in enumerate(parts):
        if index > 0:
            if await _wait_or_abort(ctx, cfg.delay_seconds):
                await save_leftover(ctx.agent_id, ctx.phone, parts[index:])
                await _clear_typing(ctx)
                return
        delivered = await _try_send(send_one, part)
        if pause:
            await buffer.refresh_lock(ctx.agent_id, ctx.phone)
        if not delivered:
            await save_leftover(ctx.agent_id, ctx.phone, parts[index + 1 :])
            await _clear_typing(ctx)
            return


async def _try_send(send_one, part: str) -> bool:
    try:
        return bool(await send_one(part))
    except Exception as error:
        log_error("split", f"bubble send failed: {str(error)[:80]}")
        return False


async def _wait_or_abort(ctx: TurnContext, delay_seconds: float) -> bool:
    """Between bubbles: interrupt check, then composing. Sleep only when delay > 0."""
    if await should_stop(ctx, full=delay_seconds > 0):
        return True
    await ctx.outbound.emit_status(ctx.phone, "מקליד")
    if delay_seconds <= 0:
        return False
    await buffer.refresh_lock(ctx.agent_id, ctx.phone)
    await asyncio.sleep(delay_seconds)
    await buffer.refresh_lock(ctx.agent_id, ctx.phone)
    return await should_stop(ctx)


async def _clear_typing(ctx: TurnContext) -> None:
    try:
        await ctx.outbound.emit_status(ctx.phone, None)
    except Exception as error:
        log_error("split", f"status clear failed: {str(error)[:80]}")
