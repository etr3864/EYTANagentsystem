"""Send the reply: attachments first, then the text."""
import asyncio

from sqlalchemy.exc import IntegrityError

from backend.core.database import SessionLocal
from backend.core.logger import log_error, log_response
from backend.services.messaging import messages
from backend.services.messaging.pipeline.context import ModelReply, TurnContext, detach

DEFAULT_MAX_MEDIA_PER_MESSAGE = 10
# Wasender document downloads can be slow; still never block a turn for minutes.
MEDIA_SEND_TIMEOUT_SECONDS = 50


def followup_after_captions(actions: list[dict], text: str) -> str:
    """Keep the agent's caption as-is; drop it from the follow-up if they repeated it."""
    leftover = (text or "").strip()
    for action in actions:
        cap = (action.get("caption") or "").strip()
        leftover = _drop_leading_caption(leftover, cap)
    return leftover


def _drop_leading_caption(text: str, caption: str) -> str:
    if not text or not caption:
        return text
    if text == caption:
        return ""
    if text.startswith(caption):
        return text[len(caption):].lstrip(" \n\t-–—,.")
    return text


async def send(ctx: TurnContext, reply: ModelReply) -> None:
    text = followup_after_captions(reply.media_actions, reply.text)
    await dispatch_media(ctx, reply.media_actions)
    log_response(
        reply.usage["input_tokens"],
        reply.usage["output_tokens"],
        reply.usage["cache_read_tokens"],
    )
    if text:
        await _send_text(ctx, text)


def _revive_conversation(ctx: TurnContext) -> None:
    """If the chat was deleted mid-turn, open a fresh one so sends can finish."""
    from backend.services.entities import conversations

    with SessionLocal() as db:
        if conversations.get_by_id(db, ctx.conversation_id):
            return
        conv = conversations.get_or_create(
            db,
            ctx.agent_id,
            ctx.user_id,
            playground_link_id=ctx.playground_link_id,
        )
        detach(db, conv)
        log_error(
            "deliver",
            f"conversation {ctx.conversation_id} gone, revived as {conv.id}",
        )
        ctx.conversation = conv


def _persist_assistant(
    ctx: TurnContext,
    content: str,
    *,
    message_type: str = "text",
    media_id: int | None = None,
    media_url: str | None = None,
):
    """Write an assistant row; recreate the conversation once if it vanished."""
    with SessionLocal() as db:
        try:
            return messages.add(
                db,
                ctx.conversation_id,
                "assistant",
                content,
                message_type=message_type,
                media_id=media_id,
                media_url=media_url,
            )
        except IntegrityError:
            db.rollback()

    _revive_conversation(ctx)
    with SessionLocal() as db:
        return messages.add(
            db,
            ctx.conversation_id,
            "assistant",
            content,
            message_type=message_type,
            media_id=media_id,
            media_url=media_url,
        )


async def dispatch_media(ctx: TurnContext, actions: list[dict]) -> int:
    """Push media to the channel now. Safe to call mid-turn (tool round).

    Returns how many new items were delivered. Already-sent media_ids are skipped
    so an eager mid-turn push and the final deliver.send do not double-fire.
    """
    if not actions:
        return 0

    limit = (ctx.agent.media_config or {}).get(
        "max_per_message", DEFAULT_MAX_MEDIA_PER_MESSAGE
    )
    sent = 0

    for action in actions:
        if sent >= limit:
            break
        media_id = action.get("media_id")
        if media_id is None or media_id in ctx.media_sent_ids:
            continue

        try:
            delivered = await asyncio.wait_for(
                ctx.outbound.send_media(
                    ctx.phone,
                    action["file_url"],
                    action["media_type"],
                    action.get("caption"),
                    action.get("filename"),
                ),
                timeout=MEDIA_SEND_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            log_error(
                ctx.provider,
                f"media send timed out after {MEDIA_SEND_TIMEOUT_SECONDS}s: {action['name']}",
            )
            continue
        except Exception as error:
            log_error(ctx.provider, f"media send error: {str(error)[:80]}")
            continue

        if not delivered:
            log_error(ctx.provider, f"media send failed: {action['name']}")
            continue

        try:
            cap = (action.get("caption") or "").strip()
            _persist_assistant(
                ctx,
                cap or f"[{action['media_type']}]: {action['name']}",
                message_type=action["media_type"],
                media_id=action["media_id"],
                media_url=action["file_url"],
            )
        except Exception as error:
            # Channel already got the file — do not abort the rest of the turn.
            log_error(ctx.provider, f"media persist failed: {str(error)[:80]}")

        ctx.media_sent_ids.add(media_id)
        sent += 1

    return sent


async def _send_text(ctx: TurnContext, text: str) -> None:
    meta = None
    try:
        saved = _persist_assistant(ctx, text)
        meta = {
            "id": saved.id,
            "role": "assistant",
            "content": text,
            "message_type": "text",
            "created_at": saved.created_at.isoformat() if saved.created_at else None,
        }
    except Exception as error:
        log_error(ctx.provider, f"text persist failed: {str(error)[:80]}")

    await ctx.outbound.emit_status(ctx.phone, "מקליד")
    delivered = await ctx.outbound.send_message(ctx.phone, text, meta=meta)
    if not delivered:
        log_error(ctx.provider, f"send failed to {ctx.display_name}")
