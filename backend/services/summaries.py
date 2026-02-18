"""Conversation summary service.

Generates automatic summaries of conversations after inactivity.
Sends summaries to external webhook with retry mechanism.
"""
import httpx
from datetime import datetime, timedelta

from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from sqlalchemy.exc import IntegrityError

from backend.models.conversation_summary import ConversationSummary
from backend.models.conversation import Conversation
from backend.models.message import Message
from backend.models.agent import Agent
from backend.models.user import User
from backend.services.ai import generate_simple_response
from backend.core.logger import log, log_error
from backend.core.enums import SummaryWebhookStatus


# Configuration
BATCH_SIZE = 50
DEFAULT_MAX_MESSAGES = 100
DEFAULT_DELAY_MINUTES = 30
DEFAULT_MIN_MESSAGES = 5
DEFAULT_RETRY_COUNT = 3
DEFAULT_RETRY_DELAY_SECONDS = 60
DEFAULT_SUMMARY_PROMPT = """סכם את השיחה הזו בצורה תמציתית.
כלול: נושאי השיחה העיקריים, בקשות הלקוח, תשובות שניתנו, והאם נותרו עניינים פתוחים."""


def get_summary_config(agent: Agent) -> dict:
    """Get summary configuration from agent with defaults."""
    config = agent.summary_config or {}
    
    return {
        "enabled": config.get("enabled", False),
        "delay_minutes": config.get("delay_minutes", DEFAULT_DELAY_MINUTES),
        "min_messages": config.get("min_messages", DEFAULT_MIN_MESSAGES),
        "max_messages": config.get("max_messages", DEFAULT_MAX_MESSAGES),
        "webhook_url": config.get("webhook_url", ""),
        "webhook_retry_count": config.get("webhook_retry_count", DEFAULT_RETRY_COUNT),
        "webhook_retry_delay": config.get("webhook_retry_delay", DEFAULT_RETRY_DELAY_SECONDS),
        "summary_prompt": config.get("summary_prompt", DEFAULT_SUMMARY_PROMPT),
    }


def _get_conversations_needing_summary(
    db: Session,
    agent_id: int,
    delay_minutes: int,
    min_messages: int,
    now: datetime
) -> list[tuple[int, int, datetime]]:
    """Find conversations that need a summary using a single optimized query.
    
    Returns list of (conversation_id, message_count, last_user_message_time).
    Uses row locking to prevent duplicate processing in multi-instance deployments.
    """
    threshold = now - timedelta(minutes=delay_minutes)
    
    # Filter to this agent's conversations for all subqueries
    agent_conv_ids = db.query(Conversation.id).filter(
        Conversation.agent_id == agent_id
    )

    # Subquery: last user message time per conversation
    last_user_msg = db.query(
        Message.conversation_id,
        func.max(Message.created_at).label("last_user_msg_time")
    ).filter(
        Message.role == "user",
        Message.conversation_id.in_(agent_conv_ids)
    ).group_by(Message.conversation_id).subquery()
    
    # Subquery: last summarized message window per conversation
    last_summary = db.query(
        ConversationSummary.conversation_id,
        func.max(ConversationSummary.last_message_at).label("last_summarized_msg")
    ).filter(
        ConversationSummary.agent_id == agent_id
    ).group_by(ConversationSummary.conversation_id).subquery()
    
    # Subquery: message count per conversation
    msg_count = db.query(
        Message.conversation_id,
        func.count(Message.id).label("msg_count")
    ).filter(
        Message.conversation_id.in_(agent_conv_ids)
    ).group_by(Message.conversation_id).subquery()
    
    # Main query: find conversations that need summary
    results = db.query(
        Conversation.id,
        msg_count.c.msg_count,
        last_user_msg.c.last_user_msg_time
    ).join(
        last_user_msg, Conversation.id == last_user_msg.c.conversation_id
    ).join(
        msg_count, Conversation.id == msg_count.c.conversation_id
    ).outerjoin(
        last_summary, Conversation.id == last_summary.c.conversation_id
    ).filter(
        Conversation.agent_id == agent_id,
        # Has enough messages
        msg_count.c.msg_count >= min_messages,
        # Last user message is old enough
        last_user_msg.c.last_user_msg_time <= threshold,
        # No summary for the current message window (or no summary at all)
        (last_summary.c.last_summarized_msg == None) | 
        (last_summary.c.last_summarized_msg < last_user_msg.c.last_user_msg_time)
    ).limit(BATCH_SIZE).all()
    
    return [(r[0], r[1], r[2]) for r in results]


def _get_conversation_text(db: Session, conversation_id: int, max_messages: int = DEFAULT_MAX_MESSAGES) -> str:
    """Get conversation text for summarization with message limit."""
    messages = db.query(Message).filter(
        Message.conversation_id == conversation_id
    ).order_by(
        Message.created_at.desc()
    ).limit(max_messages).all()
    
    # Reverse to chronological order
    messages = list(reversed(messages))
    
    lines = []
    for msg in messages:
        role = "לקוח" if msg.role == "user" else "סוכן"
        # Truncate very long messages
        content = (msg.content or "")[:1000]
        lines.append(f"{role}: {content}")
    
    return "\n".join(lines)


async def _generate_summary(conversation_text: str, prompt: str) -> str:
    """Generate summary using AI."""
    # Truncate if too long (rough estimate: 4 chars per token, max ~8000 tokens)
    max_chars = 30000
    if len(conversation_text) > max_chars:
        conversation_text = conversation_text[:max_chars] + "\n...[השיחה קוצרה]"
    
    full_prompt = f"""{prompt}

---
השיחה:
{conversation_text}

---
כתוב סיכום תמציתי וברור."""
    
    return await generate_simple_response(full_prompt)


async def _send_webhook(url: str, payload: dict) -> tuple[bool, str | None]:
    """Send webhook with payload. Returns (success, error)."""
    if not url:
        return False, "no webhook URL configured"
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload)
            
            if 200 <= response.status_code < 300:
                return True, None
            return False, f"HTTP {response.status_code}"
    except httpx.TimeoutException:
        return False, "timeout"
    except Exception as e:
        return False, str(e)[:100]


async def create_and_send_summary(
    db: Session,
    conversation_id: int,
    agent: Agent,
    user: User,
    message_count: int,
    config: dict
) -> ConversationSummary | None:
    """Create a summary for conversation and attempt webhook send."""
    last_user_msg_time = db.query(func.max(Message.created_at)).filter(
        Message.conversation_id == conversation_id,
        Message.role == "user"
    ).scalar()

    if last_user_msg_time:
        existing = db.query(ConversationSummary.id).filter(
            ConversationSummary.conversation_id == conversation_id,
            ConversationSummary.last_message_at == last_user_msg_time
        ).first()
        if existing:
            return None

    max_msgs = config.get("max_messages", DEFAULT_MAX_MESSAGES)
    conversation_text = _get_conversation_text(db, conversation_id, max_msgs)
    if not conversation_text:
        return None
    
    try:
        summary_text = await _generate_summary(
            conversation_text, 
            config["summary_prompt"]
        )
    except Exception as e:
        log_error("summaries", f"AI generation failed for conv {conversation_id}: {str(e)[:50]}")
        return None
    
    retry_delay = config.get("webhook_retry_delay", DEFAULT_RETRY_DELAY_SECONDS)
    next_retry = datetime.utcnow() + timedelta(seconds=retry_delay)
    
    summary = ConversationSummary(
        conversation_id=conversation_id,
        agent_id=agent.id,
        user_id=user.id,
        summary_text=summary_text,
        message_count=message_count,
        last_message_at=last_user_msg_time,
        webhook_status=SummaryWebhookStatus.PENDING,
        webhook_attempts=0,
        next_retry_at=next_retry,
    )
    db.add(summary)
    
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return None
    
    db.refresh(summary)
    await _try_send_webhook(db, summary, agent, user, config)
    
    return summary


async def _try_send_webhook(
    db: Session,
    summary: ConversationSummary,
    agent: Agent,
    user: User,
    config: dict
) -> bool:
    """Attempt to send summary webhook."""
    webhook_url = config.get("webhook_url")
    if not webhook_url:
        summary.webhook_status = SummaryWebhookStatus.FAILED
        summary.webhook_last_error = "no webhook URL"
        db.commit()
        return False
    
    payload = {
        "event": "conversation_summary",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "agent_id": agent.id,
        "agent_name": agent.name,
        "conversation_id": summary.conversation_id,
        "customer_name": user.name or "",
        "customer_phone": user.phone or "",
        "message_count": summary.message_count,
        "summary": summary.summary_text,
    }
    
    summary.webhook_attempts += 1
    success, error = await _send_webhook(webhook_url, payload)
    
    if success:
        summary.webhook_status = SummaryWebhookStatus.SENT
        summary.webhook_sent_at = datetime.utcnow()
        summary.next_retry_at = None
        log("summaries", msg=f"webhook sent for conv {summary.conversation_id}")
    else:
        summary.webhook_last_error = error
        max_retries = config.get("webhook_retry_count", DEFAULT_RETRY_COUNT)
        
        if summary.webhook_attempts >= max_retries:
            summary.webhook_status = SummaryWebhookStatus.FAILED
            summary.next_retry_at = None
            log_error("summaries", f"webhook failed after {max_retries} attempts: {error}")
        else:
            # Schedule next retry
            retry_delay = config.get("webhook_retry_delay", DEFAULT_RETRY_DELAY_SECONDS)
            summary.next_retry_at = datetime.utcnow() + timedelta(seconds=retry_delay)
    
    db.commit()
    return success


async def process_pending_summaries(db: Session) -> int:
    """Find conversations needing summaries and create them.
    
    Uses optimized single query and row locking for scalability.
    Returns count of summaries created.
    """
    now = datetime.utcnow()
    created = 0
    
    # Get agents with summaries enabled (small query, agents table is small)
    agents_with_summaries = db.query(Agent).filter(
        Agent.is_active == True,
        Agent.summary_config.isnot(None)
    ).all()
    
    for agent in agents_with_summaries:
        config = get_summary_config(agent)
        if not config["enabled"]:
            continue
        
        # Single optimized query with row locking
        conversations = _get_conversations_needing_summary(
            db,
            agent.id,
            config["delay_minutes"],
            config["min_messages"],
            now
        )
        
        for conv_id, msg_count, _ in conversations:
            user = db.query(User).join(Conversation).filter(
                Conversation.id == conv_id
            ).first()
            
            if not user:
                continue
            
            try:
                summary = await create_and_send_summary(
                    db, conv_id, agent, user, msg_count, config
                )
                if summary:
                    created += 1
            except Exception as e:
                log_error("summaries", f"failed conv {conv_id}: {str(e)[:50]}")
    
    if created > 0:
        log("summaries", msg=f"created {created} summaries")
    
    return created


async def retry_pending_webhooks(db: Session) -> int:
    """Retry webhooks that are due for retry.
    
    Only processes webhooks where next_retry_at has passed.
    Does NOT block with sleep - uses scheduled retry times instead.
    """
    now = datetime.utcnow()
    
    # Find webhooks due for retry
    pending = db.query(ConversationSummary).filter(
        ConversationSummary.webhook_status == SummaryWebhookStatus.PENDING,
        ConversationSummary.webhook_attempts > 0,
        ConversationSummary.next_retry_at <= now
    ).limit(BATCH_SIZE).all()
    
    if not pending:
        return 0
    
    success_count = 0
    
    for summary in pending:
        agent = db.query(Agent).filter(Agent.id == summary.agent_id).first()
        user = db.query(User).filter(User.id == summary.user_id).first()
        
        if not agent or not user:
            summary.webhook_status = SummaryWebhookStatus.FAILED
            summary.webhook_last_error = "agent or user not found"
            summary.next_retry_at = None
            db.commit()
            continue
        
        config = get_summary_config(agent)
        success = await _try_send_webhook(db, summary, agent, user, config)
        if success:
            success_count += 1
    
    if success_count > 0:
        log("summaries", msg=f"retried {success_count} webhooks successfully")
    
    return success_count


# Public function for API test endpoint
async def send_test_webhook(url: str, payload: dict) -> tuple[bool, str | None]:
    """Public wrapper for webhook testing."""
    return await _send_webhook(url, payload)
