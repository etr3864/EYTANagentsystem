"""Calendar API routes for Google Calendar OAuth and configuration."""
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from backend.core.database import get_db
from backend.core.config import settings
from backend.core.logger import log_error
from backend.services import agents, calendar, appointments


router = APIRouter(prefix="/calendar", tags=["calendar"])


class ReminderRule(BaseModel):
    """Single reminder rule configuration."""
    minutes_before: int  # e.g., 1440 (24h), 60 (1h)
    content_type: str = "template"  # template, ai
    template: Optional[str] = None
    ai_prompt: Optional[str] = None


class RemindersConfig(BaseModel):
    """Reminders configuration."""
    enabled: bool = False
    rules: list[ReminderRule] = []


class CalendarConfigUpdate(BaseModel):
    google_calendar_id: Optional[str] = None
    working_hours: Optional[dict] = None
    default_duration: Optional[int] = None
    buffer_minutes: Optional[int] = None
    days_ahead: Optional[int] = None
    timezone: Optional[str] = None
    webhook_url: Optional[str] = None
    appointment_prompt: Optional[str] = None
    reminders: Optional[RemindersConfig] = None


@router.get("/{agent_id}/oauth-url")
async def get_oauth_url(
    agent_id: int, 
    request: Request, 
    db: Session = Depends(get_db)
):
    """Get Google OAuth URL for calendar connection."""
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Use env variable if set, otherwise build from request headers
    if settings.oauth_redirect_base:
        redirect_uri = f"{settings.oauth_redirect_base}/api/calendar/callback"
    else:
        host = request.headers.get("x-forwarded-host") or request.headers.get("host", "localhost:8000")
        scheme = request.headers.get("x-forwarded-proto", "https" if "ngrok" in host else "http")
        redirect_uri = f"{scheme}://{host}/api/calendar/callback"
    
    # State contains agent_id for the callback
    state = str(agent_id)
    
    url = calendar.get_oauth_url(redirect_uri, state)
    return {"url": url, "redirect_uri": redirect_uri}


@router.get("/callback", response_class=HTMLResponse)
async def oauth_callback(code: str, state: str, request: Request, db: Session = Depends(get_db)):
    """Handle Google OAuth callback."""
    try:
        agent_id = int(state)
    except:
        log_error("calendar_callback", f"invalid state: {state}")
        return HTMLResponse("<html><body><h1>שגיאה: state לא תקין</h1></body></html>", status_code=400)
    
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        log_error("calendar_callback", f"agent not found: {agent_id}")
        return HTMLResponse("<html><body><h1>שגיאה: סוכן לא נמצא</h1></body></html>", status_code=404)
    
    # Build redirect URI (must match the one used in oauth-url)
    if settings.oauth_redirect_base:
        redirect_uri = f"{settings.oauth_redirect_base}/api/calendar/callback"
    else:
        host = request.headers.get("x-forwarded-host") or request.headers.get("host", "localhost:8000")
        scheme = request.headers.get("x-forwarded-proto", "https" if "ngrok" in host else "http")
        redirect_uri = f"{scheme}://{host}/api/calendar/callback"
    
    tokens = await calendar.exchange_code_for_tokens(code, redirect_uri)
    if not tokens:
        log_error("calendar_callback", f"token exchange failed for agent {agent_id}")
        return HTMLResponse("<html><body><h1>שגיאה: לא ניתן לקבל הרשאות</h1></body></html>", status_code=400)
    
    # Save tokens to agent config
    appointments.update_calendar_config(db, agent, {"google_tokens": tokens})
    
    # Redirect back to the agent page calendar tab
    frontend_url = "http://localhost:3001"
    return HTMLResponse(f"""
    <html>
    <head>
        <meta http-equiv="refresh" content="2;url={frontend_url}/agent/{agent_id}?tab=calendar">
    </head>
    <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
        <h1 style="color: #22c55e;">✓ חיבור הצליח!</h1>
        <p>מועבר לדף הסוכן...</p>
    </body>
    </html>
    """)


@router.get("/{agent_id}/calendars")
async def list_calendars(agent_id: int, db: Session = Depends(get_db)):
    """List available Google calendars for the agent."""
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    config = appointments.get_calendar_config(agent)
    tokens = config.get("google_tokens")
    
    if not tokens:
        raise HTTPException(status_code=400, detail="Google Calendar not connected")
    
    result = await calendar.get_valid_access_token(tokens)
    if not result:
        raise HTTPException(status_code=401, detail="Token expired, please reconnect")
    
    access_token, updated_tokens = result
    if updated_tokens != tokens:
        appointments.update_calendar_config(db, agent, {"google_tokens": updated_tokens})
    
    calendars = await calendar.list_calendars(access_token)
    return {"calendars": calendars}


@router.get("/{agent_id}/config")
async def get_config(agent_id: int, db: Session = Depends(get_db)):
    """Get calendar configuration for an agent."""
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    config = appointments.get_calendar_config(agent)
    raw_config = agent.calendar_config or {}
    
    # Don't expose tokens
    return {
        "connected": config.get("google_tokens") is not None,
        "google_calendar_id": config.get("google_calendar_id"),
        "working_hours": config.get("working_hours"),
        "default_duration": config.get("default_duration"),
        "buffer_minutes": config.get("buffer_minutes"),
        "days_ahead": config.get("days_ahead"),
        "timezone": config.get("timezone"),
        "webhook_url": config.get("webhook_url"),
        "appointment_prompt": agent.appointment_prompt,
        "reminders": raw_config.get("reminders", {"enabled": False, "rules": []}),
    }


@router.put("/{agent_id}/config")
async def update_config(agent_id: int, config: CalendarConfigUpdate, db: Session = Depends(get_db)):
    """Update calendar configuration for an agent."""
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    updates = {}
    if config.google_calendar_id is not None:
        updates["google_calendar_id"] = config.google_calendar_id
    if config.working_hours is not None:
        updates["working_hours"] = config.working_hours
    if config.default_duration is not None:
        updates["default_duration"] = config.default_duration
    if config.buffer_minutes is not None:
        updates["buffer_minutes"] = config.buffer_minutes
    if config.days_ahead is not None:
        updates["days_ahead"] = config.days_ahead
    if config.timezone is not None:
        updates["timezone"] = config.timezone
    if config.webhook_url is not None:
        updates["webhook_url"] = config.webhook_url if config.webhook_url else None
    if config.reminders is not None:
        updates["reminders"] = config.reminders.model_dump()
    
    if updates:
        appointments.update_calendar_config(db, agent, updates)
    
    # Update appointment_prompt separately (it's a direct field, not in JSON)
    if config.appointment_prompt is not None:
        agent.appointment_prompt = config.appointment_prompt if config.appointment_prompt else None
        db.commit()
    
    return {"status": "updated"}


@router.delete("/{agent_id}/disconnect")
async def disconnect_calendar(agent_id: int, db: Session = Depends(get_db)):
    """Disconnect Google Calendar from agent."""
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    appointments.update_calendar_config(db, agent, {"google_tokens": None})
    return {"status": "disconnected"}


class TestReminderRequest(BaseModel):
    """Request to send a test reminder."""
    phone: str
    rule_index: int = 0


@router.post("/{agent_id}/test-reminder")
async def send_test_reminder(
    agent_id: int,
    request: TestReminderRequest,
    db: Session = Depends(get_db)
):
    """Send a test reminder to verify the template works."""
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo
    from backend.services import providers
    from backend.services.reminders import get_reminder_config, _build_from_template, _build_from_ai, _get_agent_personality, DEFAULT_TEMPLATE
    
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # Only WA Sender supported for now
    if agent.provider != "wasender":
        raise HTTPException(
            status_code=400, 
            detail="תזכורות WhatsApp נתמכות כרגע רק עם WA Sender"
        )
    
    config = get_reminder_config(agent)
    rules = config.get("rules", [])
    
    if request.rule_index >= len(rules):
        raise HTTPException(status_code=400, detail="Rule index out of range")
    
    rule = rules[request.rule_index]
    
    # Build test variables
    calendar_config = agent.calendar_config or {}
    tz = ZoneInfo(calendar_config.get("timezone", "Asia/Jerusalem"))
    tomorrow = datetime.now(tz) + timedelta(days=1)
    
    variables = {
        "customer_name": "לקוח לדוגמה",
        "customer_phone": request.phone,
        "title": "פגישת טסט",
        "description": "תיאור לדוגמה",
        "date": tomorrow.strftime("%d/%m/%Y"),
        "time": "10:00",
        "day": "שלישי",
        "duration": "30",
        "agent_name": agent.name,
    }
    
    # Build content based on rule
    template = rule.get("template", DEFAULT_TEMPLATE)
    content_type = rule.get("content_type", "template")
    
    if content_type == "ai":
        ai_prompt = rule.get("ai_prompt", "")
        agent_personality = _get_agent_personality(agent)
        content = await _build_from_ai(ai_prompt, variables, template, agent_personality, "")
    else:
        content = _build_from_template(template, variables)
    
    # Send
    sent = await providers.send_message(agent, request.phone, content)
    
    if not sent:
        raise HTTPException(status_code=500, detail="שליחה נכשלה")
    
    return {"status": "sent", "content": content}


@router.get("/{agent_id}/availability")
async def check_availability(
    agent_id: int,
    start_date: str,
    end_date: str,
    duration: int = None,
    db: Session = Depends(get_db)
):
    """Check available time slots for an agent."""
    from datetime import datetime
    
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    try:
        start = datetime.fromisoformat(start_date)
        end = datetime.fromisoformat(end_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")
    
    slots = await appointments.check_availability(db, agent, start, end, duration)
    return {"slots": slots}
