"""Appointment management service."""
import httpx
from datetime import datetime, timedelta, time
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from backend.models.appointment import Appointment
from backend.models.agent import Agent
from backend.models.conversation import Conversation
from backend.services import calendar
from backend.core.logger import log, log_error


# Default working hours (Sunday=0, Monday=1, ..., Saturday=6)
DEFAULT_WORKING_HOURS = {
    "0": {"start": "09:00", "end": "17:00"},  # Sunday
    "1": {"start": "09:00", "end": "17:00"},  # Monday
    "2": {"start": "09:00", "end": "17:00"},  # Tuesday
    "3": {"start": "09:00", "end": "17:00"},  # Wednesday
    "4": {"start": "09:00", "end": "17:00"},  # Thursday
    "5": None,  # Friday - closed
    "6": None,  # Saturday - closed
}


def get_calendar_config(agent: Agent) -> dict:
    """Get calendar config with defaults."""
    config = agent.calendar_config or {}
    return {
        "google_tokens": config.get("google_tokens"),
        "google_calendar_id": config.get("google_calendar_id", "primary"),
        "working_hours": config.get("working_hours", DEFAULT_WORKING_HOURS),
        "default_duration": config.get("default_duration", 30),
        "buffer_minutes": config.get("buffer_minutes", 10),
        "days_ahead": config.get("days_ahead", 14),
        "timezone": config.get("timezone", "Asia/Jerusalem"),
        "webhook_url": config.get("webhook_url"),
    }


def update_calendar_config(db: Session, agent: Agent, updates: dict) -> Agent:
    """Update agent's calendar config."""
    if agent.calendar_config is None:
        agent.calendar_config = {}
    
    agent.calendar_config.update(updates)
    flag_modified(agent, "calendar_config")
    db.commit()
    db.refresh(agent)
    return agent


# --- Google Calendar Token Management ---

async def _get_google_token(db: Session, agent: Agent, config: dict) -> Optional[str]:
    """Get valid Google access token, auto-refreshing and saving if needed.
    
    This centralizes the token refresh logic that was duplicated across functions.
    Returns access_token or None if not connected/failed.
    """
    tokens = config.get("google_tokens")
    if not tokens:
        return None
    
    result = await calendar.get_valid_access_token(tokens)
    if not result:
        return None
    
    access_token, updated_tokens = result
    
    # Save updated tokens if they changed (refresh occurred)
    if updated_tokens != tokens:
        update_calendar_config(db, agent, {"google_tokens": updated_tokens})
    
    return access_token


# --- Availability Calculation ---

def _generate_day_slots(
    date: datetime.date,
    working_hours: dict,
    duration: int,
    tz: ZoneInfo
) -> list[tuple[datetime, datetime]]:
    """Generate all possible time slots for a single day."""
    day_of_week = str(date.isoweekday() % 7)  # Sunday=0
    hours = working_hours.get(day_of_week)
    
    if not hours:
        return []
    
    start_h, start_m = map(int, hours["start"].split(":"))
    end_h, end_m = map(int, hours["end"].split(":"))
    
    slot_start = datetime.combine(date, time(start_h, start_m), tzinfo=tz)
    day_end = datetime.combine(date, time(end_h, end_m), tzinfo=tz)
    
    slots = []
    while slot_start + timedelta(minutes=duration) <= day_end:
        slot_end = slot_start + timedelta(minutes=duration)
        slots.append((slot_start, slot_end))
        slot_start = slot_end
    
    return slots


def _is_slot_available(
    slot_start: datetime,
    slot_end: datetime,
    busy_times: list[tuple[datetime, datetime]],
    buffer: int,
    tz: ZoneInfo
) -> bool:
    """Check if a slot conflicts with any busy time (including buffer)."""
    from backend.core.timezone import UTC
    
    for busy_start, busy_end in busy_times:
        # Add buffer around busy times
        busy_start_buffered = busy_start - timedelta(minutes=buffer)
        busy_end_buffered = busy_end + timedelta(minutes=buffer)
        
        # Ensure timezone awareness - DB stores UTC as naive datetime
        if busy_start.tzinfo is None:
            busy_start_buffered = busy_start_buffered.replace(tzinfo=UTC)
            busy_end_buffered = busy_end_buffered.replace(tzinfo=UTC)
        
        # Check overlap
        if not (slot_end <= busy_start_buffered or slot_start >= busy_end_buffered):
            return False
    
    return True


async def _get_all_busy_times(
    db: Session,
    agent: Agent,
    config: dict,
    start_date: datetime,
    end_date: datetime,
    access_token: Optional[str]
) -> list[tuple[datetime, datetime]]:
    """Get busy times from both Google Calendar and local DB."""
    busy_times = []
    
    # From Google Calendar
    if access_token:
        google_busy = await calendar.get_busy_times(
            access_token,
            config["google_calendar_id"],
            start_date,
            end_date,
            config["timezone"]
        )
        busy_times.extend(google_busy)
    
    # From local DB (in case Google sync failed)
    db_appointments = db.query(Appointment).filter(
        Appointment.agent_id == agent.id,
        Appointment.status == "scheduled",
        Appointment.start_time >= start_date,
        Appointment.start_time <= end_date
    ).all()
    
    for apt in db_appointments:
        busy_times.append((apt.start_time, apt.end_time))
    
    return busy_times


async def check_availability(
    db: Session,
    agent: Agent,
    start_date: datetime,
    end_date: datetime,
    duration_minutes: int = None
) -> list[dict]:
    """Check available time slots for an agent.
    
    Returns list of available slots:
    [{"date": "2026-02-10", "start": "09:00", "end": "09:30"}, ...]
    """
    config = get_calendar_config(agent)
    duration = duration_minutes or config["default_duration"]
    buffer = config["buffer_minutes"]
    tz = ZoneInfo(config["timezone"])
    working_hours = config["working_hours"]
    now = datetime.now(tz)
    
    # Get Google token (handles refresh automatically)
    access_token = await _get_google_token(db, agent, config)
    
    # Collect all busy times
    busy_times = await _get_all_busy_times(
        db, agent, config, start_date, end_date, access_token
    )
    
    # Generate available slots
    available_slots = []
    current_date = start_date.date()
    end_date_only = end_date.date()
    
    while current_date <= end_date_only:
        day_slots = _generate_day_slots(current_date, working_hours, duration, tz)
        
        for slot_start, slot_end in day_slots:
            # Skip past slots
            if slot_start <= now:
                continue
            
            if _is_slot_available(slot_start, slot_end, busy_times, buffer, tz):
                available_slots.append({
                    "date": current_date.isoformat(),
                    "start": slot_start.strftime("%H:%M"),
                    "end": slot_end.strftime("%H:%M"),
                    "datetime": slot_start.isoformat()
                })
        
        current_date += timedelta(days=1)
    
    return available_slots


# --- Appointment CRUD ---

async def book_appointment(
    db: Session,
    agent: Agent,
    user_id: int,
    start_time: datetime,
    duration_minutes: int,
    title: str,
    description: str = ""
) -> Optional[Appointment]:
    """Book an appointment with race condition protection."""
    log("calendar", msg=f"booking: {title} at {start_time} for {duration_minutes}min")
    config = get_calendar_config(agent)
    end_time = start_time + timedelta(minutes=duration_minutes)
    
    # Check for conflicts
    conflict = db.query(Appointment).filter(
        Appointment.agent_id == agent.id,
        Appointment.status == "scheduled",
        Appointment.start_time < end_time,
        Appointment.end_time > start_time
    ).first()
    
    if conflict:
        log_error("appointments", "booking conflict")
        return None
    
    # Create Google Calendar event if connected
    google_event_id = None
    access_token = await _get_google_token(db, agent, config)
    
    if access_token:
        google_event_id = await calendar.create_event(
            access_token,
            config["google_calendar_id"],
            title,
            start_time,
            end_time,
            description,
            config["timezone"]
        )
        log("calendar", event_id=google_event_id)
    
    # Create appointment in DB
    appointment = Appointment(
        agent_id=agent.id,
        user_id=user_id,
        google_event_id=google_event_id,
        start_time=start_time,
        end_time=end_time,
        title=title,
        description=description,
        status="scheduled"
    )
    
    try:
        db.add(appointment)
        db.commit()
        db.refresh(appointment)
    except Exception as e:
        db.rollback()
        log_error("appointments", f"booking failed: {str(e)[:50]}")
        return None
    
    # Send webhook
    await send_webhook(agent, appointment, "appointment.created", db)
    
    # Create scheduled reminders
    from backend.services.reminders import create_reminders_for_appointment
    create_reminders_for_appointment(db, appointment, agent, user_id)
    
    log("APPOINTMENT_CREATED", agent=agent.name, title=title)
    return appointment


async def cancel_appointment(db: Session, appointment: Appointment, agent: Agent) -> bool:
    """Cancel an appointment."""
    config = get_calendar_config(agent)
    
    # Cancel pending reminders
    from backend.services.reminders import cancel_reminders_for_appointment
    cancel_reminders_for_appointment(db, appointment.id)
    
    # Delete from Google Calendar if exists
    if appointment.google_event_id:
        access_token = await _get_google_token(db, agent, config)
        if access_token:
            await calendar.delete_event(
                access_token,
                config["google_calendar_id"],
                appointment.google_event_id
            )
    
    # Update status
    appointment.status = "cancelled"
    db.commit()
    
    await send_webhook(agent, appointment, "appointment.cancelled", db)
    log("APPOINTMENT_CANCELLED", agent=agent.name, id=appointment.id)
    return True


async def reschedule_appointment(
    db: Session,
    appointment: Appointment,
    agent: Agent,
    new_start_time: datetime,
    new_duration_minutes: int = None
) -> bool:
    """Reschedule an appointment with race condition protection."""
    config = get_calendar_config(agent)
    
    duration = new_duration_minutes or appointment.duration_minutes
    new_end_time = new_start_time + timedelta(minutes=duration)
    
    # Check for conflicts
    conflict = db.query(Appointment).filter(
        Appointment.agent_id == agent.id,
        Appointment.status == "scheduled",
        Appointment.id != appointment.id,
        Appointment.start_time < new_end_time,
        Appointment.end_time > new_start_time
    ).first()
    
    if conflict:
        return False
    
    # Cancel old reminders
    from backend.services.reminders import cancel_reminders_for_appointment, create_reminders_for_appointment
    cancel_reminders_for_appointment(db, appointment.id)
    
    # Update Google Calendar if exists
    if appointment.google_event_id:
        access_token = await _get_google_token(db, agent, config)
        if access_token:
            await calendar.update_event(
                access_token,
                config["google_calendar_id"],
                appointment.google_event_id,
                start_time=new_start_time,
                end_time=new_end_time,
                timezone=config["timezone"]
            )
    
    # Update in DB
    appointment.start_time = new_start_time
    appointment.end_time = new_end_time
    db.commit()
    db.refresh(appointment)
    
    # Create new reminders
    create_reminders_for_appointment(db, appointment, agent, appointment.user_id)
    
    await send_webhook(agent, appointment, "appointment.updated", db)
    log("APPOINTMENT_RESCHEDULED", agent=agent.name, id=appointment.id)
    return True


# --- Queries ---

def get_user_appointments(
    db: Session,
    agent_id: int,
    user_id: int,
    include_past: bool = False
) -> list[Appointment]:
    """Get appointments for a specific user."""
    query = db.query(Appointment).filter(
        Appointment.agent_id == agent_id,
        Appointment.user_id == user_id,
        Appointment.status == "scheduled"
    )
    
    if not include_past:
        query = query.filter(Appointment.start_time > datetime.utcnow())
    
    return query.order_by(Appointment.start_time).all()


def get_appointment_by_id(db: Session, appointment_id: int) -> Optional[Appointment]:
    """Get appointment by ID."""
    return db.query(Appointment).filter(Appointment.id == appointment_id).first()


# --- Webhook ---

async def _generate_appointment_summary(agent: Agent, appointment: Appointment, db: Session) -> str | None:
    """Generate conversation summary for appointment webhook if summaries are enabled."""
    from backend.services.summaries import get_summary_config, _get_conversation_text, _generate_summary

    summary_config = get_summary_config(agent)
    if not summary_config["enabled"]:
        return None

    conv = db.query(Conversation).filter(
        Conversation.agent_id == agent.id,
        Conversation.user_id == appointment.user_id
    ).first()
    if not conv:
        return None

    conversation_text = _get_conversation_text(db, conv.id)
    if not conversation_text:
        return None

    try:
        summary_text = await _generate_summary(conversation_text, summary_config["summary_prompt"])
    except Exception as e:
        log_error("appointments", f"summary generation failed: {str(e)[:50]}")
        return None

    from backend.models.conversation_summary import ConversationSummary
    from backend.core.enums import SummaryWebhookStatus
    from backend.models.message import Message
    from sqlalchemy import func
    from sqlalchemy.exc import IntegrityError

    msg_count = db.query(func.count(Message.id)).filter(
        Message.conversation_id == conv.id
    ).scalar() or 0

    last_user_msg_time = db.query(func.max(Message.created_at)).filter(
        Message.conversation_id == conv.id,
        Message.role == "user"
    ).scalar()

    record = ConversationSummary(
        conversation_id=conv.id,
        agent_id=agent.id,
        user_id=appointment.user_id,
        summary_text=summary_text,
        message_count=msg_count,
        last_message_at=last_user_msg_time,
        webhook_status=SummaryWebhookStatus.SENT,
        webhook_attempts=1,
        webhook_sent_at=datetime.utcnow(),
    )
    db.add(record)
    
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return None

    return summary_text


async def send_webhook(agent: Agent, appointment: Appointment, event: str, db: Session) -> None:
    """Send webhook notification for appointment events."""
    config = get_calendar_config(agent)
    webhook_url = config.get("webhook_url")
    
    if not webhook_url:
        return
    
    from backend.services import users
    user = users.get_by_id(db, appointment.user_id)

    # Generate conversation summary if summaries are enabled
    summary_text = await _generate_appointment_summary(agent, appointment, db)
    
    payload = {
        "event": event,
        "appointment": {
            "id": appointment.id,
            "start_time": f"{appointment.start_time.isoformat()}Z",
            "end_time": f"{appointment.end_time.isoformat()}Z",
            "duration_minutes": appointment.duration_minutes,
            "title": appointment.title,
            "description": appointment.description,
            "status": appointment.status,
        },
        "customer": {
            "name": user.name if user else None,
            "phone": user.phone if user else None,
        },
        "agent": {
            "id": agent.id,
            "name": agent.name,
        },
        "calendar_id": config.get("google_calendar_id"),
        "conversation_summary": summary_text,
    }
    
    try:
        async with httpx.AsyncClient() as client:
            await client.post(webhook_url, json=payload, timeout=15)
    except Exception as e:
        log_error("webhook", f"appointment webhook failed: {str(e)[:60]}")
