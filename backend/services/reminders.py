"""Appointment reminder service.

Handles creating and sending scheduled reminders for appointments.
"""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.models.scheduled_reminder import ScheduledReminder
from backend.models.appointment import Appointment
from backend.models.agent import Agent
from backend.models.user import User
from backend.services import providers, conversations, messages
from backend.core.logger import log, log_error
from backend.core.enums import ReminderStatus, ReminderContentType
from backend.core.timezone import get_tz, to_utc, from_utc, now_local


# Configuration
BATCH_SIZE = 50  # Max reminders to process per cycle
BATCH_DELAY_SECONDS = 1  # Delay between batches to avoid rate limits

# Default reminder template
DEFAULT_TEMPLATE = """שלום {customer_name},
תזכורת לפגישה שלך "{title}" ב-{date} בשעה {time}.
נתראה!"""


def get_reminder_config(agent: Agent) -> dict:
    """Get reminder configuration from agent's calendar_config."""
    config = agent.calendar_config or {}
    reminders = config.get("reminders", {})
    
    return {
        "enabled": reminders.get("enabled", False),
        "rules": reminders.get("rules", []),
    }


def create_reminders_for_appointment(
    db: Session,
    appointment: Appointment,
    agent: Agent,
    user_id: int
) -> list[ScheduledReminder]:
    """Create scheduled reminder records for a new appointment."""
    config = get_reminder_config(agent)
    
    if not config["enabled"] or not config["rules"]:
        return []
    
    calendar_config = agent.calendar_config or {}
    timezone = calendar_config.get("timezone", "Asia/Jerusalem")
    tz = get_tz(timezone)
    now = now_local(timezone)
    
    created = []
    
    for idx, rule in enumerate(config["rules"]):
        minutes_before = rule.get("minutes_before", 60)
        scheduled_for = appointment.start_time - timedelta(minutes=minutes_before)
        
        # Ensure timezone awareness
        if scheduled_for.tzinfo is None:
            scheduled_for = scheduled_for.replace(tzinfo=tz)
        
        # Skip if reminder time has already passed
        if scheduled_for <= now:
            continue
        
        reminder = ScheduledReminder(
            appointment_id=appointment.id,
            agent_id=agent.id,
            user_id=user_id,
            scheduled_for=to_utc(scheduled_for),
            status=ReminderStatus.PENDING,
            content_type=rule.get("content_type", ReminderContentType.TEMPLATE),
            template=rule.get("template", DEFAULT_TEMPLATE),
            ai_prompt=rule.get("ai_prompt"),
            rule_index=idx,
        )
        
        db.add(reminder)
        created.append(reminder)
    
    if created:
        db.commit()
        log("calendar", msg=f"created {len(created)} reminders for apt {appointment.id}")
    
    return created


def cancel_reminders_for_appointment(db: Session, appointment_id: int) -> int:
    """Cancel all pending reminders for an appointment."""
    count = db.query(ScheduledReminder).filter(
        ScheduledReminder.appointment_id == appointment_id,
        ScheduledReminder.status == ReminderStatus.PENDING
    ).update({"status": ReminderStatus.CANCELLED})
    
    db.commit()
    return count


# --- Content Building ---

def _get_hebrew_day(weekday: int) -> str:
    """Convert Python weekday (0=Monday) to Hebrew day name."""
    days = ["שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת", "ראשון"]
    return days[weekday]


def _build_template_variables(
    appointment: Appointment,
    agent: Agent,
    user: User
) -> dict:
    """Build variables dictionary for template substitution."""
    calendar_config = agent.calendar_config or {}
    timezone = calendar_config.get("timezone", "Asia/Jerusalem")
    
    # Convert appointment time to local timezone
    start_local = from_utc(appointment.start_time, timezone)
    
    return {
        "customer_name": user.name or "לקוח/ה יקר/ה",
        "customer_phone": user.phone or "",
        "title": appointment.title or "פגישה",
        "description": appointment.description or "",
        "date": start_local.strftime("%d/%m/%Y"),
        "time": start_local.strftime("%H:%M"),
        "day": _get_hebrew_day(start_local.weekday()),
        "duration": str(appointment.duration_minutes),
        "agent_name": agent.name,
    }


def _build_from_template(template: str, variables: dict) -> str:
    """Build content from template with variable substitution."""
    try:
        return template.format(**variables)
    except KeyError as e:
        log_error("reminders", f"template var missing: {e}")
        return template


async def _build_from_ai(
    ai_prompt: str, 
    variables: dict, 
    fallback_template: str,
    agent_personality: str = "",
    conversation_history: str = ""
) -> str:
    """Build content using AI generation with fallback.
    
    Args:
        ai_prompt: Custom instructions from user
        variables: Template variables (customer_name, date, etc.)
        fallback_template: Template to use if AI fails
        agent_personality: First part of agent's system prompt (optional)
        conversation_history: Recent messages with customer (optional)
    """
    if not ai_prompt:
        return _build_from_template(fallback_template, variables)
    
    # Build context with all available info
    context_parts = [
        "צור הודעת תזכורת לפגישה עבור הלקוח.",
        "",
        "פרטי הפגישה:",
        f"- כותרת: {variables['title']}",
        f"- תאריך: {variables['date']} (יום {variables['day']})",
        f"- שעה: {variables['time']}",
        f"- משך: {variables['duration']} דקות",
        f"- שם הלקוח: {variables['customer_name']}",
        f"- שם העסק: {variables['agent_name']}",
    ]
    
    # Add agent personality if available
    if agent_personality:
        context_parts.extend([
            "",
            "אישיות הסוכן/העסק:",
            agent_personality,
        ])
    
    # Add conversation history if available
    if conversation_history:
        context_parts.extend([
            "",
            "הודעות אחרונות מהשיחה עם הלקוח:",
            conversation_history,
        ])
    
    context_parts.extend([
        "",
        f"הנחיות: {ai_prompt}",
        "",
        "כתוב הודעה קצרה וידידותית בהתאם לאישיות הסוכן ולהיסטוריית השיחה.",
        "אל תוסיף כותרת או סיומת - רק את ההודעה עצמה.",
    ])
    
    context = "\n".join(context_parts)
    
    try:
        from backend.services.ai import generate_simple_response
        return await generate_simple_response(context)
    except Exception as e:
        log_error("reminders", f"AI generation failed: {str(e)[:50]}")
        return _build_from_template(fallback_template, variables)


def _get_conversation_context(db: Session, agent_id: int, user_id: int, limit: int = 10) -> str:
    """Get recent conversation history with the customer."""
    conv = conversations.get_by_agent_and_user(db, agent_id, user_id)
    if not conv:
        return ""
    
    recent = messages.get_by_conversation(db, conv.id, limit=limit)
    if not recent:
        return ""
    
    # Format messages (oldest first for context)
    lines = []
    for msg in reversed(recent):
        role = "לקוח" if msg.role == "user" else "סוכן"
        # Truncate long messages
        content = msg.content[:150] + "..." if len(msg.content) > 150 else msg.content
        lines.append(f"{role}: {content}")
    
    return "\n".join(lines)


def _get_agent_personality(agent: Agent, max_chars: int = 500) -> str:
    """Extract agent personality from system prompt."""
    if not agent.system_prompt:
        return ""
    
    # Take first part of system prompt (the personality/character)
    prompt = agent.system_prompt.strip()
    if len(prompt) <= max_chars:
        return prompt
    
    # Try to cut at sentence boundary
    cut = prompt[:max_chars]
    last_period = cut.rfind(".")
    if last_period > max_chars // 2:
        return cut[:last_period + 1]
    
    return cut + "..."


async def build_reminder_content(
    db: Session,
    reminder: ScheduledReminder,
    appointment: Appointment,
    agent: Agent,
    user: User
) -> str:
    """Build the reminder message content.
    
    For AI-generated content, includes:
    - Agent personality (from system prompt)
    - Recent conversation history (last 10 messages)
    """
    variables = _build_template_variables(appointment, agent, user)
    template = reminder.template or DEFAULT_TEMPLATE
    
    if reminder.content_type == ReminderContentType.AI:
        # Get additional context for better AI generation
        agent_personality = _get_agent_personality(agent)
        conversation_history = _get_conversation_context(db, agent.id, user.id)
        
        return await _build_from_ai(
            reminder.ai_prompt, 
            variables, 
            template,
            agent_personality,
            conversation_history
        )
    
    return _build_from_template(template, variables)


# --- Sending ---

async def _send_to_customer(
    agent: Agent,
    user: User,
    content: str,
    db: Session
) -> tuple[bool, str | None]:
    """Send reminder to customer via WhatsApp. Returns (success, error).
    
    Note: Only works with WA Sender. Meta WhatsApp requires approved templates
    for proactive messages, which is not yet implemented.
    """
    if not user.phone:
        return False, "no customer phone"
    
    # Meta WhatsApp requires templates for proactive messages - not supported yet
    if agent.provider != "wasender":
        return False, "meta provider requires templates (not implemented)"
    
    sent = await providers.send_message(agent, user.phone, content)
    if not sent:
        return False, "whatsapp send failed"
    
    # Save to conversation history so agent is aware
    conv = conversations.get_or_create(db, agent.id, user.id)
    messages.add(db, conv.id, "assistant", content, message_type="reminder")
    log("calendar", msg=f"reminder sent to {user.phone[:6]}...")
    
    return True, None


async def send_reminder(db: Session, reminder: ScheduledReminder) -> bool:
    """Send a reminder to the customer via WhatsApp."""
    # Load related objects
    appointment = db.query(Appointment).filter(
        Appointment.id == reminder.appointment_id
    ).first()
    
    if not appointment:
        _mark_failed(reminder, "appointment not found")
        return False
    
    if appointment.status != "scheduled":
        reminder.status = ReminderStatus.CANCELLED
        return False
    
    agent = db.query(Agent).filter(Agent.id == reminder.agent_id).first()
    user = db.query(User).filter(User.id == reminder.user_id).first()
    
    if not agent or not user:
        _mark_failed(reminder, "agent or user not found")
        return False
    
    # Build content
    content = await build_reminder_content(db, reminder, appointment, agent, user)
    
    # Send to customer via WhatsApp
    success, err = await _send_to_customer(agent, user, content, db)
    
    # Update status
    reminder.sent_at = datetime.utcnow()
    
    if success:
        reminder.status = ReminderStatus.SENT
    else:
        _mark_failed(reminder, err or "send failed")
    
    return success


def _mark_failed(reminder: ScheduledReminder, error: str) -> None:
    """Mark reminder as failed with error message."""
    reminder.status = ReminderStatus.FAILED
    reminder.error_message = error[:255]


# --- Processing ---

async def process_pending_reminders(db: Session) -> int:
    """Process pending reminders that are due.
    
    Uses row locking to prevent duplicate sends in multi-instance deployments.
    Processes in batches to avoid memory issues and rate limits.
    """
    import asyncio
    
    now = datetime.utcnow()
    processed = 0
    
    while True:
        # Fetch batch of pending reminders
        pending = db.query(ScheduledReminder).filter(
            ScheduledReminder.status == ReminderStatus.PENDING,
            ScheduledReminder.scheduled_for <= now
        ).limit(BATCH_SIZE).all()
        
        if not pending:
            break
        
        for reminder in pending:
            # Mark as processing to prevent double-send
            reminder.status = "processing"
            db.commit()
            try:
                await send_reminder(db, reminder)
                processed += 1
            except Exception as e:
                _mark_failed(reminder, f"exception: {str(e)[:200]}")
                log_error("reminders", f"processing failed: {str(e)[:50]}")
        
        db.commit()
        
        # Rate limit between batches
        if len(pending) == BATCH_SIZE:
            await asyncio.sleep(BATCH_DELAY_SECONDS)
    
    if processed > 0:
        log("calendar", msg=f"processed {processed} reminders")
    
    return processed
