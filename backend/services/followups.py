"""Follow-up service for customer re-engagement.

Orchestrates: scan → schedule → process → send → cancel.
AI evaluation logic lives in followup_evaluator.py.
"""
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models.scheduled_followup import ScheduledFollowup
from backend.models.scheduled_reminder import ScheduledReminder
from backend.models.conversation import Conversation
from backend.models.whatsapp_template import WhatsAppTemplate
from backend.models.agent import Agent
from backend.models.message import Message
from backend.models.user import User
from backend.services import providers, conversations, messages
from backend.services import followup_evaluator
from backend.core.logger import log, log_error
from backend.core.enums import FollowupStatus, ReminderStatus


BATCH_SIZE = 50
SCAN_LOOKBACK_DAYS = 30

DEFAULT_CONFIG = {
    "enabled": False,
    "model": "claude-sonnet-4-5",
    "ai_instructions": "",
    "inactivity_minutes": 120,
    "min_messages": 4,
    "max_followups": 3,
    "cooldown_hours": 12,
    "max_per_day": 2,
    "intervals_minutes": [120, 1440, 2880],
    "active_hours": {"start": "09:00", "end": "21:00"},
    "meta_templates": [],
}


def get_config(agent: Agent) -> dict:
    """Get follow-up config with defaults."""
    config = DEFAULT_CONFIG.copy()
    if agent.followup_config:
        config.update(agent.followup_config)
    return config


# ──────────────────────────────────────────
# Scan: find conversations that need follow-up
# ──────────────────────────────────────────

def scan_for_followups(db: Session) -> int:
    """Find eligible conversations and schedule follow-ups. Returns count created."""
    now = datetime.utcnow()
    cutoff = now - timedelta(days=SCAN_LOOKBACK_DAYS)

    agents = db.query(Agent).filter(
        Agent.is_active == True,
        Agent.followup_config.isnot(None),
    ).all()

    created = 0
    for agent in agents:
        config = get_config(agent)
        if not config["enabled"]:
            continue
        created += _scan_agent(db, agent, config, now, cutoff)

    if created:
        log("followup", msg=f"scheduled {created} follow-ups")
    return created


def _scan_agent(db: Session, agent: Agent, config: dict, now: datetime, cutoff: datetime) -> int:
    """Scan conversations for a single agent using a single bulk query."""
    inactivity_threshold = now - timedelta(minutes=config["inactivity_minutes"])
    min_messages = config["min_messages"]
    max_followups = config["max_followups"]
    max_attempts = max_followups * 2
    cooldown_hours = config.get("cooldown_hours", 12)
    cooldown_threshold = now - timedelta(hours=cooldown_hours)
    max_per_day = config.get("max_per_day", 2)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    agent_conv_ids = db.query(Conversation.id).filter(
        Conversation.agent_id == agent.id,
    )

    # Subquery: conversations with a pending/evaluating follow-up (exclude them)
    has_pending = db.query(ScheduledFollowup.conversation_id).filter(
        ScheduledFollowup.conversation_id.in_(agent_conv_ids),
        ScheduledFollowup.status.in_([FollowupStatus.PENDING, FollowupStatus.EVALUATING]),
    ).subquery()

    # Subquery: sent count per conversation
    sent_counts = db.query(
        ScheduledFollowup.conversation_id,
        func.count(ScheduledFollowup.id).label("cnt"),
    ).filter(
        ScheduledFollowup.conversation_id.in_(agent_conv_ids),
        ScheduledFollowup.status == FollowupStatus.SENT,
    ).group_by(ScheduledFollowup.conversation_id).subquery()

    # Subquery: total attempts (sent + skipped) per conversation
    attempt_counts = db.query(
        ScheduledFollowup.conversation_id,
        func.count(ScheduledFollowup.id).label("cnt"),
    ).filter(
        ScheduledFollowup.conversation_id.in_(agent_conv_ids),
        ScheduledFollowup.status.in_([FollowupStatus.SENT, FollowupStatus.SKIPPED]),
    ).group_by(ScheduledFollowup.conversation_id).subquery()

    # Subquery: last message role per conversation
    last_msg_role = db.query(
        Message.conversation_id,
        Message.role,
    ).filter(
        Message.conversation_id.in_(agent_conv_ids),
    ).distinct(Message.conversation_id).order_by(
        Message.conversation_id, Message.created_at.desc(),
    ).subquery()

    # Subquery: message count per conversation
    msg_counts = db.query(
        Message.conversation_id,
        func.count(Message.id).label("cnt"),
    ).filter(
        Message.conversation_id.in_(agent_conv_ids),
    ).group_by(Message.conversation_id).subquery()

    # Subquery: conversations with pending reminders
    has_reminder = db.query(ScheduledReminder.user_id).filter(
        ScheduledReminder.agent_id == agent.id,
        ScheduledReminder.status == ReminderStatus.PENDING,
    ).subquery()

    # Subquery: last sent follow-up time per conversation (for cooldown)
    last_sent = db.query(
        ScheduledFollowup.conversation_id,
        func.max(ScheduledFollowup.sent_at).label("last_sent_at"),
    ).filter(
        ScheduledFollowup.conversation_id.in_(agent_conv_ids),
        ScheduledFollowup.status == FollowupStatus.SENT,
    ).group_by(ScheduledFollowup.conversation_id).subquery()

    # Subquery: today's sent count per conversation
    today_sent = db.query(
        ScheduledFollowup.conversation_id,
        func.count(ScheduledFollowup.id).label("cnt"),
    ).filter(
        ScheduledFollowup.conversation_id.in_(agent_conv_ids),
        ScheduledFollowup.status == FollowupStatus.SENT,
        ScheduledFollowup.sent_at >= today_start,
    ).group_by(ScheduledFollowup.conversation_id).subquery()

    # Main query: eligible conversations
    results = (
        db.query(Conversation.id, func.coalesce(sent_counts.c.cnt, 0).label("sent_count"))
        .outerjoin(sent_counts, sent_counts.c.conversation_id == Conversation.id)
        .outerjoin(attempt_counts, attempt_counts.c.conversation_id == Conversation.id)
        .outerjoin(last_msg_role, last_msg_role.c.conversation_id == Conversation.id)
        .outerjoin(msg_counts, msg_counts.c.conversation_id == Conversation.id)
        .outerjoin(last_sent, last_sent.c.conversation_id == Conversation.id)
        .outerjoin(today_sent, today_sent.c.conversation_id == Conversation.id)
        .filter(
            Conversation.agent_id == agent.id,
            Conversation.opted_out == False,
            Conversation.is_paused == False,
            Conversation.last_customer_message_at.isnot(None),
            Conversation.last_customer_message_at > cutoff,
            Conversation.last_customer_message_at < inactivity_threshold,
            # No pending/evaluating follow-up
            Conversation.id.notin_(db.query(has_pending.c.conversation_id)),
            # Last message is from assistant
            last_msg_role.c.role == "assistant",
            # Minimum message count
            func.coalesce(msg_counts.c.cnt, 0) >= min_messages,
            # Sent count under limit
            func.coalesce(sent_counts.c.cnt, 0) < max_followups,
            # Total attempts under limit
            func.coalesce(attempt_counts.c.cnt, 0) < max_attempts,
            # No pending reminder for this user
            Conversation.user_id.notin_(db.query(has_reminder.c.user_id)),
            # Cooldown: no follow-up sent within cooldown window
            func.coalesce(last_sent.c.last_sent_at, datetime.min) < cooldown_threshold,
            # Daily limit
            func.coalesce(today_sent.c.cnt, 0) < max_per_day,
        )
        .all()
    )

    created = 0
    for conv_id, sent_count in results:
        conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
        if not conv:
            continue
        try:
            if _schedule_followup(db, conv, agent, config, now, sent_count):
                db.commit()
                created += 1
        except IntegrityError:
            db.rollback()

    return created



def _schedule_followup(
    db: Session, conv: Conversation, agent: Agent, config: dict,
    now: datetime, sent_count: int
) -> bool:
    """Create a scheduled follow-up record."""
    followup_number = sent_count + 1

    intervals = config.get("intervals_minutes", [120])
    idx = min(followup_number - 1, len(intervals) - 1)
    delay_minutes = intervals[idx]

    scheduled_for = now + timedelta(minutes=delay_minutes)
    scheduled_for = _clamp_to_active_hours(scheduled_for, config.get("active_hours", {}))

    db.add(ScheduledFollowup(
        conversation_id=conv.id,
        agent_id=agent.id,
        user_id=conv.user_id,
        followup_number=followup_number,
        scheduled_for=scheduled_for,
    ))
    return True


def _clamp_to_active_hours(dt: datetime, active_hours: dict) -> datetime:
    """Push datetime into allowed active hours window.

    Works in local timezone (Asia/Jerusalem by default).
    Supports ranges that cross midnight (e.g. 10:00-04:00 = 10am to 4am next day).
    Input/output are naive UTC datetimes (for DB storage).
    """
    from backend.core.timezone import from_utc, to_utc, DEFAULT_TZ

    start_str = active_hours.get("start", "09:00")
    end_str = active_hours.get("end", "21:00")

    start_h, start_m = map(int, start_str.split(":"))
    end_h, end_m = map(int, end_str.split(":"))

    # Convert UTC to local for comparison
    local = from_utc(dt, DEFAULT_TZ)

    local_start = local.replace(hour=start_h, minute=start_m, second=0, microsecond=0)
    local_end = local.replace(hour=end_h, minute=end_m, second=0, microsecond=0)

    crosses_midnight = local_end <= local_start

    if crosses_midnight:
        # Range like 10:00-04:00 means "10am today → 4am tomorrow"
        # In-window if: time >= start OR time < end
        in_window = local >= local_start or local < local_end
    else:
        # Normal range like 09:00-21:00
        in_window = local_start <= local < local_end

    if in_window:
        return dt

    # Outside window — push to next start
    if local < local_start:
        clamped = local_start
    else:
        # Past end (or past midnight in cross-midnight case) — next day's start
        clamped = local_start + timedelta(days=1)

    return to_utc(clamped.replace(tzinfo=None), DEFAULT_TZ)


# ──────────────────────────────────────────
# Process: evaluate with AI and send
# ──────────────────────────────────────────

async def process_pending_followups(db: Session) -> int:
    """Process follow-ups that are due. Returns count processed."""
    import asyncio
    from backend.core.database import SessionLocal

    MAX_CONCURRENT = 5
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)

    now = datetime.utcnow()
    processed = 0

    while True:
        pending = db.query(ScheduledFollowup).filter(
            ScheduledFollowup.status == FollowupStatus.PENDING,
            ScheduledFollowup.scheduled_for <= now,
        ).limit(BATCH_SIZE).all()

        if not pending:
            break

        # Mark entire batch as EVALUATING in one commit
        fu_ids = []
        for fu in pending:
            fu.status = FollowupStatus.EVALUATING
            fu_ids.append(fu.id)
        db.commit()

        # Process concurrently — each task gets its own DB session
        async def _run(followup_id: int) -> bool:
            async with semaphore:
                local_db = SessionLocal()
                try:
                    fu = local_db.query(ScheduledFollowup).filter(
                        ScheduledFollowup.id == followup_id,
                    ).first()
                    if not fu:
                        return False
                    await _process_single(local_db, fu)
                    local_db.commit()
                    return True
                except Exception as e:
                    local_db.rollback()
                    try:
                        fu = local_db.query(ScheduledFollowup).filter(
                            ScheduledFollowup.id == followup_id,
                        ).first()
                        if fu:
                            fu.status = FollowupStatus.SKIPPED
                            fu.ai_reason = f"error: {str(e)[:200]}"
                            local_db.commit()
                    except Exception:
                        local_db.rollback()
                    log_error("followup", f"processing failed: {str(e)[:50]}")
                    return False
                finally:
                    local_db.close()

        results = await asyncio.gather(*[_run(fid) for fid in fu_ids])
        processed += sum(1 for r in results if r)

        # Refresh main session to see changes made by sub-sessions
        db.expire_all()

        if len(pending) == BATCH_SIZE:
            await asyncio.sleep(1)

    if processed:
        log("followup", msg=f"processed {processed} follow-ups")
    return processed


async def _process_single(db: Session, fu: ScheduledFollowup) -> None:
    """Evaluate and potentially send a single follow-up."""
    conv = db.query(Conversation).filter(Conversation.id == fu.conversation_id).first()
    agent = db.query(Agent).filter(Agent.id == fu.agent_id).first()
    user = db.query(User).filter(User.id == fu.user_id).first()

    if not conv or not agent or not user:
        _skip(fu, "missing conversation, agent, or user")
        return

    # Safety re-checks (state may have changed since scheduling)
    if conv.opted_out or conv.is_paused or not agent.is_active:
        fu.status = FollowupStatus.CANCELLED
        return

    # Customer responded since scheduling
    if conv.last_customer_message_at and conv.last_customer_message_at > fu.created_at:
        fu.status = FollowupStatus.CANCELLED
        return

    config = get_config(agent)
    needs_template = _needs_meta_template(agent, conv)

    # If Meta after 24h but no templates configured — skip
    if needs_template and not config.get("meta_templates"):
        _skip(fu, "meta provider after 24h but no templates configured")
        return

    # AI evaluation
    decision = await followup_evaluator.evaluate(db, fu, agent, user, config, needs_template, conv.id)

    if not decision.get("send"):
        _skip(fu, decision.get("reason", "AI decided not to send"))
        return

    # Send
    success, err = await _send(db, fu, conv, agent, user, decision, needs_template)
    if success:
        fu.status = FollowupStatus.SENT
        fu.sent_at = datetime.utcnow()
        fu.content = decision.get("content", "")
    else:
        _skip(fu, err or "send failed")


def _needs_meta_template(agent: Agent, conv: Conversation) -> bool:
    """Check if this follow-up requires a Meta template (24h window expired)."""
    if agent.provider != "meta":
        return False
    if not conv.last_customer_message_at:
        return True
    hours_since = (datetime.utcnow() - conv.last_customer_message_at).total_seconds() / 3600
    return hours_since > 24


def _skip(fu: ScheduledFollowup, reason: str) -> None:
    fu.status = FollowupStatus.SKIPPED
    fu.ai_reason = reason[:500]


# ──────────────────────────────────────────
# Send
# ──────────────────────────────────────────

async def _send(
    db: Session, fu: ScheduledFollowup, conv: Conversation,
    agent: Agent, user: User, decision: dict, needs_template: bool
) -> tuple[bool, str | None]:
    """Send the follow-up message. Returns (success, error)."""
    if not user.phone:
        return False, "no customer phone"

    if needs_template:
        return await _send_as_template(db, fu, conv, agent, user, decision)
    else:
        return await _send_as_freetext(db, fu, conv, agent, user, decision)


async def _send_as_freetext(
    db: Session, fu: ScheduledFollowup, conv: Conversation,
    agent: Agent, user: User, decision: dict
) -> tuple[bool, str | None]:
    """Send follow-up as free-text message."""
    content = decision.get("content", "")
    if not content:
        return False, "AI returned empty content"

    sent = await providers.send_message(agent, user.phone, content)
    if not sent:
        return False, "whatsapp send failed"

    messages.add(db, conv.id, "assistant", content, message_type="followup")
    fu.sent_via = "free_text"
    log("followup", msg=f"sent #{fu.followup_number} to {user.phone[:6]}...")
    return True, None


async def _send_as_template(
    db: Session, fu: ScheduledFollowup, conv: Conversation,
    agent: Agent, user: User, decision: dict
) -> tuple[bool, str | None]:
    """Send follow-up as Meta template message."""
    template_name = decision.get("template_name", "")
    language = decision.get("template_language", "he")
    params = decision.get("template_params", [])

    if not template_name:
        return False, "AI did not select a template"

    # Verify template is still approved
    tpl = db.query(WhatsAppTemplate).filter(
        WhatsAppTemplate.agent_id == agent.id,
        WhatsAppTemplate.name == template_name,
        WhatsAppTemplate.language == language,
        WhatsAppTemplate.status == "APPROVED",
    ).first()

    if not tpl:
        return False, f"template '{template_name}' not found or not approved"

    # Build components
    components = []
    if params:
        components = [{
            "type": "body",
            "parameters": [{"type": "text", "text": str(p)} for p in params],
        }]

    sent = await providers.send_template(
        agent, user.phone, template_name, language, components,
    )
    if not sent:
        return False, "meta template send failed"

    # Save a readable version to conversation history
    summary = f"[follow-up template: {template_name}]"
    messages.add(db, conv.id, "assistant", summary, message_type="followup")
    fu.sent_via = "meta_template"
    fu.template_name = template_name
    log("followup", msg=f"template '{template_name}' sent #{fu.followup_number} to {user.phone[:6]}...")
    return True, None


# ──────────────────────────────────────────
# Cancel
# ──────────────────────────────────────────

def cancel_pending_followups(db: Session, conversation_id: int) -> int:
    """Cancel all pending follow-ups for a conversation. Returns count cancelled."""
    count = db.query(ScheduledFollowup).filter(
        ScheduledFollowup.conversation_id == conversation_id,
        ScheduledFollowup.status.in_([FollowupStatus.PENDING, FollowupStatus.EVALUATING]),
    ).update({"status": FollowupStatus.CANCELLED}, synchronize_session="fetch")
    return count
