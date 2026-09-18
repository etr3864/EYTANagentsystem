"""Send the reply: attachments first, then the text."""
from backend.core.database import SessionLocal
from backend.core.logger import log_error, log_response
from backend.services.messaging import messages
from backend.services.messaging.pipeline.context import ModelReply, TurnContext

DEFAULT_MAX_MEDIA_PER_MESSAGE = 10


async def send(ctx: TurnContext, reply: ModelReply) -> None:
    await _send_attachments(ctx, reply.media_actions)
    await _send_text(ctx, reply)


async def _send_attachments(ctx: TurnContext, actions: list[dict]) -> None:
    if not actions:
        return

    limit = (ctx.agent.media_config or {}).get(
        "max_per_message", DEFAULT_MAX_MEDIA_PER_MESSAGE
    )
    seen_media_ids = set()
    sent = 0

    with SessionLocal() as db:
        for action in actions:
            if sent >= limit:
                break
            media_id = action.get("media_id")
            if media_id in seen_media_ids:
                continue
            seen_media_ids.add(media_id)

            delivered = await ctx.outbound.send_media(
                ctx.phone,
                action["file_url"],
                action["media_type"],
                action.get("caption"),
                action.get("filename"),
            )
            if not delivered:
                log_error(ctx.provider, f"media send failed: {action['name']}")
                continue

            messages.add(
                db,
                ctx.conversation_id,
                "assistant",
                f"[{action['media_type']}]: {action['name']}",
                message_type=action["media_type"],
                media_id=action["media_id"],
                media_url=action["file_url"],
            )
            sent += 1


async def _send_text(ctx: TurnContext, reply: ModelReply) -> None:
    if not (reply.text and reply.text.strip()):
        return

    with SessionLocal() as db:
        saved = messages.add(db, ctx.conversation_id, "assistant", reply.text)
        meta = {
            "id": saved.id,
            "role": "assistant",
            "content": reply.text,
            "message_type": "text",
            "created_at": saved.created_at.isoformat() if saved.created_at else None,
        }

    log_response(
        reply.usage["input_tokens"],
        reply.usage["output_tokens"],
        reply.usage["cache_read_tokens"],
    )
    await ctx.outbound.emit_status(ctx.phone, "מקליד")
    delivered = await ctx.outbound.send_message(ctx.phone, reply.text, meta=meta)
    if not delivered:
        log_error(ctx.provider, f"send failed to {ctx.display_name}")
