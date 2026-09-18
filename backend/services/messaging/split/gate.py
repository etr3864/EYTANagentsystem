"""Stop the rest of a burst when the customer spoke or the chat is no longer live."""
from backend.core.database import SessionLocal
from backend.services.entities import agents, conversations
from backend.services.messaging import buffer
from backend.services.messaging.pipeline.context import TurnContext


async def should_stop(ctx: TurnContext, *, full: bool = True) -> bool:
    if await buffer.peek_count(ctx.agent_id, ctx.phone) > 0:
        return True
    if not full:
        return False
    return chat_halted(ctx)


def chat_halted(ctx: TurnContext) -> bool:
    with SessionLocal() as db:
        conv = conversations.get_by_id(db, ctx.conversation_id)
        if conv is None or conv.is_paused or conv.opted_out:
            return True
        agent = agents.get_by_id(db, ctx.agent_id)
        if agent is None or not agent.is_active:
            return True
    return False
