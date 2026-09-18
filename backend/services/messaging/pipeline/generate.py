"""The model call. Holds no database connection while the model is thinking."""
import asyncio
from typing import Optional

from backend.core.database import SessionLocal
from backend.core.logger import log_error
from backend.services.entities import ai
from backend.services.entities.tools import handle_tool_calls
from backend.services.messaging.pipeline import deliver
from backend.services.messaging.pipeline.context import (
    ModelReply,
    PromptInputs,
    TurnContext,
)

ERROR_REPLY = "לא הצלחנו לענות עכשיו. אפשר לשלוח שוב בעוד רגע?"
# Wall clock for the whole model turn (all tool rounds). Better a fallback
# reply than a conversation that stays silent until the customer pokes again.
LLM_TURN_TIMEOUT_SECONDS = 120

SEARCH_TOOLS = frozenset({"search_knowledge", "query_products"})


def _status_for(tool_names: set[str]) -> str:
    if tool_names & SEARCH_TOOLS:
        return "מחפש במאגר"
    if "send_media" in tool_names:
        return "שולח מדיה"
    return "מריץ פעולה"


def _tool_handler(ctx: TurnContext, function_runtime):
    """Each tool round gets its own session; media leaves the channel immediately."""

    async def handle(calls: list[dict]):
        names = {call.get("name") or "" for call in calls}
        await ctx.outbound.emit_status(ctx.phone, _status_for(names))
        with SessionLocal() as db:
            results = await handle_tool_calls(
                db,
                ctx.agent,
                ctx.user_id,
                calls,
                conversation_id=ctx.conversation_id,
                function_runtime=function_runtime,
                simulate_calendar=ctx.caps.calendar_as_connected,
            )

        # Do not wait for the model's follow-up text — that round is what used
        # to hang (especially on Gemini) and left the customer with nothing.
        media_actions = [
            row["result"]
            for row in results
            if isinstance(row.get("result"), dict)
            and row["result"].get("action") == "send_media"
        ]
        if media_actions:
            await deliver.dispatch_media(ctx, media_actions)

        return results

    return handle


async def reply(ctx: TurnContext, inputs: PromptInputs) -> Optional[ModelReply]:
    """Ask the model. Returns None when the customer already got an error reply."""
    try:
        text, _tool_calls, usage, media_actions = await asyncio.wait_for(
            ai.get_response(
                model=ctx.agent.model,
                system_prompt=ctx.prompt,
                history=inputs.history,
                user_message=ctx.combined_text,
                user_info=ctx.user_info,
                pending_messages=ctx.pending,
                knowledge_context=inputs.knowledge_context,
                media_context=inputs.media_context,
                tool_handler=_tool_handler(ctx, inputs.function_runtime),
                appointment_prompt=ctx.agent.appointment_prompt,
                calendar_config=inputs.calendar_config,
                user_appointments=inputs.user_appointments,
                agent=ctx.agent,
                extra_tools=inputs.extra_tools,
            ),
            timeout=LLM_TURN_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        log_error(ctx.provider, f"ai timed out after {LLM_TURN_TIMEOUT_SECONDS}s")
        await ctx.outbound.send_message(ctx.phone, ERROR_REPLY)
        return None
    except Exception as error:
        log_error(ctx.provider, f"ai failed: {str(error)[:120]}")
        await ctx.outbound.send_message(ctx.phone, ERROR_REPLY)
        return None

    return ModelReply(text=text, usage=usage, media_actions=media_actions)
