"""Unified tool handler for AI tools."""
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Any

from sqlalchemy.orm import Session

from backend.models.agent import Agent
from backend.services import users, documents, tables, appointments, agent_media, conversations
from backend.core.logger import log, log_tool, log_error
from backend.core.timezone import from_utc


# ============ Tool Handlers ============

def _handle_update_user_info(db: Session, user_id: int, data: dict) -> str:
    """Update user information from AI-learned data."""
    if "name" in data:
        users.update(db, user_id, name=data["name"])
    if "gender" in data:
        users.update(db, user_id, gender=data["gender"])
    if "business_type" in data:
        users.update_metadata(db, user_id, "business_type", data["business_type"])
    if "notes" in data:
        users.update_metadata(db, user_id, "notes", data["notes"])
    return "עודכן בהצלחה"


def _handle_search_knowledge(db: Session, agent_id: int, data: dict) -> str:
    """Search documents knowledge base."""
    query = data.get("query", "")
    doc_results = documents.search(db, agent_id, query, limit=5)
    
    content = []
    for doc in doc_results:
        content.append(f"[מסמך: {doc['document']}] {doc['content'][:500]}")
    
    result = "\n\n".join(content) if content else "לא נמצא מידע רלוונטי"
    log_tool("search_knowledge", len(result))
    return result


def _handle_query_products(db: Session, agent_id: int, data: dict) -> str:
    """Query products/data tables."""
    search_text = data.get("search", "")
    filters = data.get("filters")
    
    agent_tables = tables.get_by_agent(db, agent_id)
    all_results = []
    
    for table in agent_tables:
        if search_text:
            rows = tables.search_rows(db, table.id, search_text, limit=5)
        elif filters:
            rows = tables.query_table(db, table.id, filters)[:10]
        else:
            rows = tables.query_table(db, table.id)[:5]
        
        for row in rows:
            all_results.append(" | ".join(f"{k}: {v}" for k, v in row.items() if v))
    
    result = "\n".join(all_results) if all_results else "לא נמצאו תוצאות"
    log_tool("query_products", len(result))
    return result


def _parse_date(date_str: str, tz: ZoneInfo, default_time: tuple[int, int] = (0, 0)) -> datetime:
    """Parse date string to datetime with timezone."""
    if "T" in date_str:
        return datetime.fromisoformat(date_str).replace(tzinfo=tz)
    return datetime.strptime(date_str, "%Y-%m-%d").replace(
        hour=default_time[0], minute=default_time[1], tzinfo=tz
    )


def _parse_datetime(dt_str: str, tz: ZoneInfo) -> datetime | None:
    """Parse datetime string supporting multiple formats."""
    if not dt_str:
        return None
    
    # Try ISO format first
    try:
        return datetime.fromisoformat(dt_str).replace(tzinfo=tz)
    except ValueError:
        pass
    
    # Try common formats
    for fmt in ["%Y-%m-%d %H:%M", "%d/%m/%Y %H:%M", "%Y-%m-%dT%H:%M:%S"]:
        try:
            return datetime.strptime(dt_str, fmt).replace(tzinfo=tz)
        except ValueError:
            continue
    
    return None


async def _handle_check_availability(
    db: Session, agent: Agent, data: dict, config: dict, tz: ZoneInfo
) -> str:
    """Check calendar availability."""
    if not config.get("google_tokens"):
        return "יומן לא מחובר"
    
    try:
        start = _parse_date(data["start_date"], tz, (0, 0))
        end = _parse_date(data["end_date"], tz, (23, 59))
        duration = data.get("duration_minutes")
        
        slots = await appointments.check_availability(db, agent, start, end, duration)
        
        if not slots:
            return "אין זמנים פנויים בטווח התאריכים שנבחר"
        
        slot_texts = [f"{s['date']} בשעה {s['start']}-{s['end']}" for s in slots[:10]]
        log_tool("check_availability", len(slots))
        return "זמנים פנויים:\n" + "\n".join(slot_texts)
    except Exception as e:
        return f"שגיאה: {str(e)[:50]}"


async def _handle_book_appointment(
    db: Session, agent: Agent, user_id: int, data: dict, config: dict, tz: ZoneInfo
) -> str:
    """Book a new appointment."""
    log("calendar", input=str(data)[:100])
    
    if not config.get("google_tokens"):
        return "יומן לא מחובר"
    
    try:
        dt_str = data.get("datetime", "")
        dt = _parse_datetime(dt_str, tz)
        
        if not dt:
            return f"פורמט תאריך לא תקין: {dt_str[:30]}" if dt_str else "חסר תאריך ושעה"
        
        # Prevent booking in the past
        if dt <= datetime.now(tz):
            return "לא ניתן לקבוע פגישה בעבר"
        
        duration = data.get("duration_minutes", 30)
        
        # Validate duration (5 min to 8 hours)
        if duration < 5 or duration > 480:
            return "משך פגישה לא תקין (מינימום 5 דקות, מקסימום 8 שעות)"
        
        title = data.get("title", "פגישה")
        description = data.get("description", "")
        
        apt = await appointments.book_appointment(db, agent, user_id, dt, duration, title, description)
        
        if apt:
            log_tool("book_appointment", 1)
            return f"פגישה נקבעה: {title} ב-{dt.strftime('%d/%m/%Y')} בשעה {dt.strftime('%H:%M')} (מזהה: {apt.id})"
        
        log_tool("book_appointment", 0)
        return "לא הצלחתי לקבוע פגישה - ייתכן שהזמן תפוס"
    except Exception as e:
        log_error("book_appointment", str(e)[:80])
        return f"שגיאה: {str(e)[:50]}"


def _handle_get_my_appointments(db: Session, agent_id: int, user_id: int, timezone: str = "Asia/Jerusalem") -> str:
    """Get user's upcoming appointments."""
    user_apts = appointments.get_user_appointments(db, agent_id, user_id)
    
    if not user_apts:
        return "אין פגישות קרובות"
    
    apt_texts = []
    for apt in user_apts:
        # DB stores UTC - convert to local timezone for display
        local_time = from_utc(apt.start_time, timezone)
        apt_texts.append(
            f"• {apt.title} - {local_time.strftime('%d/%m/%Y')} "
            f"בשעה {local_time.strftime('%H:%M')} (מזהה: {apt.id})"
        )
    return "הפגישות שלך:\n" + "\n".join(apt_texts)


async def _handle_cancel_appointment(
    db: Session, agent: Agent, user_id: int, data: dict
) -> str:
    """Cancel an existing appointment."""
    apt_id = data["appointment_id"]
    apt = appointments.get_appointment_by_id(db, apt_id)
    
    if not apt or apt.user_id != user_id:
        return "פגישה לא נמצאה"
    
    await appointments.cancel_appointment(db, apt, agent)
    return f"פגישה {apt.title} בוטלה בהצלחה"


async def _handle_reschedule_appointment(
    db: Session, agent: Agent, user_id: int, data: dict, tz: ZoneInfo
) -> str:
    """Reschedule an existing appointment."""
    apt_id = data["appointment_id"]
    apt = appointments.get_appointment_by_id(db, apt_id)
    
    if not apt or apt.user_id != user_id:
        return "פגישה לא נמצאה"
    
    new_dt = datetime.fromisoformat(data["new_datetime"]).replace(tzinfo=tz)
    
    # Prevent rescheduling to the past
    if new_dt <= datetime.now(tz):
        return "לא ניתן להעביר פגישה לעבר"
    
    new_duration = data.get("new_duration_minutes")
    
    # Validate duration if provided
    if new_duration is not None and (new_duration < 5 or new_duration > 480):
        return "משך פגישה לא תקין (מינימום 5 דקות, מקסימום 8 שעות)"
    
    success = await appointments.reschedule_appointment(db, apt, agent, new_dt, new_duration)
    if success:
        return f"פגישה הועברה ל-{new_dt.strftime('%d/%m/%Y')} בשעה {new_dt.strftime('%H:%M')}"
    return "לא הצלחתי לשנות - ייתכן שהזמן תפוס"


# ============ Opt-out Handler ============

def _handle_opt_out(db: Session, conversation_id: int) -> str:
    """Handle opt_out_conversation tool - mark conversation as opted out."""
    if not conversation_id:
        return "שגיאה: לא ניתן לבצע opt-out"
    conv = conversations.set_opted_out(db, conversation_id, True)
    if not conv:
        return "שגיאה: שיחה לא נמצאה"
    return "הלקוח הוסר בהצלחה מרשימת ההודעות היזומות."


# ============ Media Handlers ============

def _is_media_already_sent(db: Session, conversation_id: int, media_id: int) -> bool:
    """Check if media was already sent in this conversation."""
    from backend.models.message import Message
    return db.query(Message).filter(
        Message.conversation_id == conversation_id,
        Message.media_id == media_id
    ).first() is not None


def _build_media_result(media, custom_caption: str | None) -> dict:
    """Build media result dict for sending."""
    caption = custom_caption if custom_caption else media.default_caption
    
    result = {
        "action": "send_media",
        "media_id": media.id,
        "media_type": media.media_type,
        "file_url": media.file_url,
        "caption": caption,
        "name": media.name
    }
    
    if media.media_type == "document" and media.filename:
        result["filename"] = media.filename
    
    return result


def _handle_send_media(
    db: Session,
    agent_id: int,
    conversation_id: int,
    data: dict,
    media_config: dict | None
) -> dict:
    """Handle send_media tool - returns media info for actual sending."""
    media_id = data.get("media_id")
    custom_caption = data.get("caption")
    
    if not media_id:
        return {"error": "חסר media_id"}
    
    media = agent_media.get_by_id(db, media_id)
    
    if not media:
        return {"error": f"מדיה {media_id} לא נמצאה"}
    
    if media.agent_id != agent_id:
        return {"error": "מדיה לא שייכת לסוכן זה"}
    
    if not media.is_active:
        return {"error": "מדיה לא פעילה"}
    
    # Check for duplicates if configured
    allow_duplicate = True
    if media_config:
        allow_duplicate = media_config.get("allow_duplicate_in_conversation", True)
    
    if not allow_duplicate and conversation_id:
        if _is_media_already_sent(db, conversation_id, media_id):
            return {
                "error": "מדיה זו כבר נשלחה בשיחה. חפש מדיה אחרת רלוונטית עם search_media, או המשך בשיחה ללא שליחת מדיה."
            }
    
    log_tool("send_media", media_id)
    return _build_media_result(media, custom_caption)


def _handle_search_media(db: Session, agent_id: int, data: dict) -> str:
    """Search media by description."""
    query = data.get("query", "")
    
    if not query:
        return "חסרה שאילתת חיפוש"
    
    results = agent_media.search(db, agent_id, query, limit=5)
    
    if not results:
        return "לא נמצאה מדיה מתאימה"
    
    media_texts = []
    for m in results:
        desc = f" - {m.description}" if m.description else ""
        media_texts.append(f"• [{m.media_type}] ID:{m.id} {m.name}{desc}")
    
    log_tool("search_media", len(results))
    return "מדיה שנמצאה:\n" + "\n".join(media_texts)


# ============ Main Handler ============

async def handle_tool_calls(
    db: Session, 
    agent: Agent, 
    user_id: int, 
    tool_calls: list[dict[str, Any]],
    conversation_id: int = None
) -> list[dict[str, Any]]:
    """Handle all AI tool calls (knowledge, appointments, user info, media).
    
    Args:
        db: Database session
        agent: Agent instance
        user_id: User ID
        tool_calls: List of tool calls from AI
        conversation_id: Conversation ID (needed for media duplicate check)
    
    Returns:
        List of results, each with 'name' and 'result' keys.
        For send_media, result is a dict with media details for actual sending.
    """
    results = []
    agent_id = agent.id
    config = appointments.get_calendar_config(agent)
    tz = ZoneInfo(config.get("timezone", "Asia/Jerusalem"))
    
    for call in tool_calls:
        name = call["name"]
        data = call["input"]
        result = None
        
        # User tools
        if name == "update_user_info":
            result = _handle_update_user_info(db, user_id, data)
        
        # Knowledge tools
        elif name == "search_knowledge":
            result = _handle_search_knowledge(db, agent_id, data)
        
        elif name == "query_products":
            result = _handle_query_products(db, agent_id, data)
        
        # Appointment tools
        elif name == "check_availability":
            result = await _handle_check_availability(db, agent, data, config, tz)
        
        elif name == "book_appointment":
            result = await _handle_book_appointment(db, agent, user_id, data, config, tz)
        
        elif name == "get_my_appointments":
            result = _handle_get_my_appointments(db, agent_id, user_id, config.get("timezone", "Asia/Jerusalem"))
        
        elif name == "cancel_appointment":
            result = await _handle_cancel_appointment(db, agent, user_id, data)
        
        elif name == "reschedule_appointment":
            result = await _handle_reschedule_appointment(db, agent, user_id, data, tz)
        
        # Opt-out
        elif name == "opt_out_conversation":
            result = _handle_opt_out(db, conversation_id)
        
        # Media tools
        elif name == "send_media":
            result = _handle_send_media(db, agent_id, conversation_id, data, agent.media_config)
        
        elif name == "search_media":
            result = _handle_search_media(db, agent_id, data)
        
        if result is not None:
            results.append({"name": name, "result": result})
    
    return results
