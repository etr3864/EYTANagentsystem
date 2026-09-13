"""Playground calendar: tools succeed on the requested slot, no Google writes."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

DEFAULT_HOURS = {
    "0": {"start": "09:00", "end": "17:00"},
    "1": {"start": "09:00", "end": "17:00"},
    "2": {"start": "09:00", "end": "17:00"},
    "3": {"start": "09:00", "end": "17:00"},
    "4": {"start": "09:00", "end": "17:00"},
    "5": None,
    "6": None,
}


def _hours_for(day: datetime, working_hours: dict) -> dict | None:
    key = str((day.weekday() + 1) % 7)
    hours = (working_hours or DEFAULT_HOURS).get(key)
    return hours if hours and hours.get("start") and hours.get("end") else None


def check_availability(data: dict, config: dict, tz: ZoneInfo) -> str:
    try:
        start = datetime.strptime(data["start_date"], "%Y-%m-%d").replace(tzinfo=tz)
        end = datetime.strptime(data["end_date"], "%Y-%m-%d").replace(tzinfo=tz)
    except (KeyError, ValueError):
        return "שגיאה: תאריכים לא תקינים"
    duration = int(data.get("duration_minutes") or config.get("default_duration") or 30)
    duration = max(15, min(duration, 180))
    hours_map = config.get("working_hours") or DEFAULT_HOURS
    slots: list[str] = []
    day = start
    while day <= end and len(slots) < 12:
        hours = _hours_for(day, hours_map)
        if hours:
            h0, m0 = (int(x) for x in hours["start"].split(":"))
            h1, m1 = (int(x) for x in hours["end"].split(":"))
            cursor = day.replace(hour=h0, minute=m0)
            close = day.replace(hour=h1, minute=m1)
            while cursor + timedelta(minutes=duration) <= close and len(slots) < 12:
                if cursor > datetime.now(tz):
                    end_t = cursor + timedelta(minutes=duration)
                    slots.append(f"{cursor.strftime('%Y-%m-%d')} בשעה {cursor.strftime('%H:%M')}-{end_t.strftime('%H:%M')}")
                cursor += timedelta(minutes=duration)
        day += timedelta(days=1)
    if not slots:
        return "אין זמנים פנויים בטווח התאריכים שנבחר"
    return "זמנים פנויים:\n" + "\n".join(slots)


def book(data: dict, tz: ZoneInfo) -> str:
    dt_str = data.get("datetime") or ""
    try:
        dt = datetime.strptime(dt_str[:16], "%Y-%m-%dT%H:%M").replace(tzinfo=tz)
    except ValueError:
        return f"פורמט תאריך לא תקין: {dt_str[:30]}" if dt_str else "חסר תאריך ושעה"
    title = data.get("title") or "פגישה"
    sim_id = f"pg{dt.strftime('%Y%m%d%H%M')}"
    return f"פגישה נקבעה: {title} ב-{dt.strftime('%d/%m/%Y')} בשעה {dt.strftime('%H:%M')} (מזהה: {sim_id})"


def cancel(data: dict) -> str:
    return f"פגישה {data.get('appointment_id', '')} בוטלה בהצלחה"


def reschedule(data: dict, tz: ZoneInfo) -> str:
    raw = data.get("new_datetime") or ""
    try:
        dt = datetime.fromisoformat(raw).replace(tzinfo=tz) if raw else None
    except ValueError:
        dt = None
    if not dt:
        return "פורמט תאריך לא תקין"
    return f"פגישה הועברה ל-{dt.strftime('%d/%m/%Y')} בשעה {dt.strftime('%H:%M')}"
