"""The model call. Holds no database connection while the model is thinking."""
from typing import Optional

from backend.core.database import SessionLocal
from backend.core.logger import log_error
from backend.services.entities import ai
from backend.services.entities.tools import handle_tool_calls
from backend.services.messaging.pipeline.context import (
    ModelReply,
    PromptInputs,
    TurnContext,
)

ERROR_REPLY = "לא הצלחנו לענות עכשיו. אפשר לשלוח שוב בעוד רגע?"

SEARCH_TOOLS = frozenset({"search_knowledge", "query_products"})


def _status_for(tool_names: set[str]) -> str:
    if tool_names & SEARCH_TOOLS:
        return "מחפש במאגר"
    if "send_media" in tool_names:
        return "שולח מדיה"
    return "מריץ פעולה"


def _tool_handler(ctx: TurnContext, function_runtime):
    """Each tool round gets its own session, opened only for as long as it runs."""

    async def handle(calls: list[dict]):
        names = {call.get("name") or "" for call in calls}
        await ctx.outbound.emit_status(ctx.phone, _status_for(names))
        with SessionLocal() as db:
            return await handle_tool_calls(
                db,
                ctx.agent,
                ctx.user_id,
                calls,
                conversation_id=ctx.conversation_id,
                function_runtime=function_runtime,
                simulate_calendar=ctx.caps.calendar_as_connected,
            )

    return handle


async def reply(ctx: TurnContext, inputs: PromptInputs) -> Optional[ModelReply]:
    """Ask the model. Returns None when the customer already got an error reply.

    No wall-clock cancel around get_response: cancelling leaves Gemini's sync
    to_thread running on the shared client and poisons later turns.
    """
    try:
        text, _tool_calls, usage, media_actions = await ai.get_response(
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
        )
    except Exception as error:
        log_error(ctx.provider, f"ai failed: {str(error)[:120]}")
        await ctx.outbound.send_message(ctx.phone, ERROR_REPLY)
        return None

    return ModelReply(text=text, usage=usage, media_actions=media_actions)
