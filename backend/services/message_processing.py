"""Shared message processing logic for all webhook handlers."""
from datetime import datetime, timedelta
from typing import Callable, Awaitable

from sqlalchemy.orm import Session

from backend.core.database import SessionLocal
from backend.core.logger import log, log_message, log_response, log_error
from backend.services import agents, users, conversations, messages, ai, knowledge, appointments
from backend.services.tools import handle_tool_calls
from backend.services.message_buffer import PendingMessage
from backend.models.user import User
from backend.models.processed_message import ProcessedMessage


# Type for media send callback: (phone, media_url, media_type, caption, filename) -> bool
MediaSendCallback = Callable[[str, str, str, str | None, str | None], Awaitable[bool]]


# TTL for deduplication records
_DEDUP_TTL_MINUTES = 5


def is_duplicate(message_id: str) -> bool:
    """Check if message was already processed using DB.
    
    This is scalable across multiple instances and survives restarts.
    """
    if not message_id:
        return False
    
    db = SessionLocal()
    try:
        # Check if exists
        existing = db.query(ProcessedMessage).filter(
            ProcessedMessage.message_id == message_id
        ).first()
        
        if existing:
            return True
        
        # Mark as processed
        db.add(ProcessedMessage(message_id=message_id))
        db.commit()
        
        # Cleanup old entries (run occasionally, not every call)
        # Only cleanup if message_id ends with '0' (~10% of calls)
        if message_id[-1:] == '0':
            _cleanup_old_entries(db)
        
        return False
    except Exception as e:
        # On DB error, log and allow processing (better than blocking)
        log_error("dedup", f"DB error: {str(e)[:50]}")
        return False
    finally:
        db.close()


def _cleanup_old_entries(db: Session) -> None:
    """Remove deduplication entries older than TTL."""
    try:
        cutoff = datetime.utcnow() - timedelta(minutes=_DEDUP_TTL_MINUTES)
        db.query(ProcessedMessage).filter(
            ProcessedMessage.processed_at < cutoff
        ).delete()
        db.commit()
    except Exception:
        pass  # Cleanup failure is not critical


def get_user_info(user: User) -> dict:
    """Extract user info for AI context."""
    return {
        "name": user.name,
        "gender": user.gender.value if user.gender else "unknown",
        "metadata": user.metadata_
    }


async def process_batched_messages(
    agent_id: int,
    user_phone: str,
    user_name: str | None,
    pending_msgs: list[PendingMessage],
    send_message: Callable[[str, str], Awaitable[bool]],
    provider: str = "meta",
    send_media: MediaSendCallback | None = None
) -> None:
    """Process batched messages with knowledge base integration.
    
    Args:
        agent_id: The agent ID
        user_phone: User's phone number
        user_name: User's name (optional)
        pending_msgs: List of pending messages to process
        send_message: Async function to send message (phone, text) -> bool
        provider: Provider name for logging
        send_media: Optional async function to send media (phone, url, type, caption) -> bool
    """
    db = SessionLocal()
    try:
        agent = agents.get_by_id(db, agent_id)
        if not agent:
            log_error("process", f"agent_id={agent_id} not found")
            return

        user = users.get_or_create(db, user_phone, user_name)
        user_info = get_user_info(user)
        
        prompt = agent.system_prompt or ""
        display_name = user.name or user_phone[-4:]
        
        batching_config = agent.get_batching_config()
        max_history = batching_config.get("max_history_messages", 20)

        conv = conversations.get_or_create(db, agent.id, user.id)
        
        # Auto opt-in: customer sending a message re-enables proactive messages
        if conv.opted_out:
            conv.opted_out = False

        # Track last customer message time + cancel pending follow-ups
        conv.last_customer_message_at = datetime.utcnow()
        db.commit()

        from backend.services.followups import cancel_pending_followups
        cancelled = cancel_pending_followups(db, conv.id)
        if cancelled:
            db.commit()

        if conv.is_paused:
            for msg in pending_msgs:
                messages.add(db, conv.id, "user", msg.text, message_type=msg.msg_type)
            log("PAUSED", agent=agent.name, user=display_name, msgs=len(pending_msgs))
            return
        
        # Process images and save messages
        has_images = False
        for msg in pending_msgs:
            content_to_save = msg.text
            
            if msg.msg_type == "image" and msg.image_base64:
                has_images = True
                description = await ai.describe_image(msg.image_base64, msg.media_type or "image/jpeg")
                content_to_save = f"[תמונה]: {description}"
                msg.text = content_to_save
            
            messages.add(db, conv.id, "user", content_to_save, message_type=msg.msg_type)
        
        combined_text = "\n".join(msg.text for msg in pending_msgs)
        log_message(agent.name, display_name, combined_text, len(pending_msgs), has_images, provider=provider)
        
        # Prepare history
        history = messages.get_history(db, conv.id)
        history = history[:-len(pending_msgs)]
        
        if len(history) > max_history:
            history = history[-max_history:]

        # Load knowledge context
        knowledge_context = knowledge.get_context(db, agent_id)

        # Load media context
        media_context = ai.build_media_context(db, agent.id, agent.media_config)

        # Load user's upcoming appointments for context
        user_appointments = []
        if agent.calendar_config and agent.calendar_config.get("google_tokens"):
            user_appointments = appointments.get_user_appointments(db, agent.id, user.id)

        # Create tool handler with conversation_id for media
        async def tool_handler(calls):
            return await handle_tool_calls(db, agent, user.id, calls, conversation_id=conv.id)

        # Get AI response
        response_text, tool_calls, usage_data, media_actions = await ai.get_response(
            model=agent.model, 
            system_prompt=prompt, 
            history=history, 
            user_message=combined_text,
            user_info=user_info,
            pending_messages=pending_msgs,
            knowledge_context=knowledge_context,
            media_context=media_context,
            tool_handler=tool_handler,
            appointment_prompt=agent.appointment_prompt,
            calendar_config=agent.calendar_config,
            user_appointments=user_appointments,
            agent=agent,
        )
        
        # Update usage
        agent.add_usage(
            model=agent.model,
            input_tokens=usage_data["input_tokens"],
            output_tokens=usage_data["output_tokens"],
            cache_read=usage_data["cache_read_tokens"],
            cache_create=usage_data["cache_creation_tokens"]
        )
        
        # Limit and send media if AI requested
        media_config = agent.media_config or {}
        max_media = media_config.get("max_per_message", 10)
        
        seen_media_ids = set()
        sent_count = 0
        for media_action in media_actions:
            if sent_count >= max_media:
                break
            
            media_id = media_action.get("media_id")
            if media_id in seen_media_ids:
                continue
            seen_media_ids.add(media_id)
            
            if send_media:
                media_ok = await send_media(
                    user_phone,
                    media_action["file_url"],
                    media_action["media_type"],
                    media_action.get("caption"),
                    media_action.get("filename")
                )
                if media_ok:
                    messages.add(
                        db, conv.id, "assistant",
                        f"[{media_action['media_type']}]: {media_action['name']}",
                        message_type=media_action["media_type"],
                        media_id=media_action["media_id"],
                        media_url=media_action["file_url"]
                    )
                    sent_count += 1
                else:
                    log_error(provider, f"media send failed: {media_action['name']}")
        
        # Only save and send if there's actual text
        if response_text and response_text.strip():
            messages.add(db, conv.id, "assistant", response_text)
            db.commit()
            log_response(usage_data["input_tokens"], usage_data["output_tokens"], usage_data["cache_read_tokens"])

            ok = await send_message(user_phone, response_text)
            if not ok:
                log_error(provider, f"send failed to {display_name}")
        else:
            db.commit()
    finally:
        db.close()
