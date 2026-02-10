"""Google Calendar integration service."""
import httpx
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode

from backend.core.config import settings
from backend.core.logger import log_error

# Google OAuth URLs
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"

# Scopes needed for calendar access
SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events"
]


def get_oauth_url(redirect_uri: str, state: str) -> str:
    """Generate Google OAuth URL for calendar access."""
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


async def exchange_code_for_tokens(code: str, redirect_uri: str) -> Optional[dict]:
    """Exchange authorization code for access and refresh tokens."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                    "redirect_uri": redirect_uri,
                },
            )
        
        if response.status_code != 200:
            log_error("calendar", f"token exchange failed: {response.text[:100]}")
            return None
        
        data = response.json()
        return {
            "access_token": data["access_token"],
            "refresh_token": data.get("refresh_token"),
            "expires_at": datetime.utcnow().timestamp() + data.get("expires_in", 3600),
        }
    except Exception as e:
        log_error("calendar", f"token exchange error: {str(e)[:80]}")
        return None


async def refresh_access_token(refresh_token: str) -> Optional[dict]:
    """Refresh an expired access token."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )
        
        if response.status_code != 200:
            log_error("calendar", f"token refresh failed: {response.text[:100]}")
            return None
        
        data = response.json()
        return {
            "access_token": data["access_token"],
            "refresh_token": refresh_token,  # Keep the same refresh token
            "expires_at": datetime.utcnow().timestamp() + data.get("expires_in", 3600),
        }
    except Exception as e:
        log_error("calendar", f"token refresh error: {str(e)[:80]}")
        return None


async def get_valid_access_token(tokens: dict) -> Optional[tuple[str, dict]]:
    """Get a valid access token, refreshing if needed. Returns (token, updated_tokens)."""
    if not tokens:
        return None
    
    expires_at = tokens.get("expires_at", 0)
    
    # If token expires in less than 5 minutes, refresh it
    if datetime.utcnow().timestamp() > expires_at - 300:
        refresh_token = tokens.get("refresh_token")
        if not refresh_token:
            return None
        
        new_tokens = await refresh_access_token(refresh_token)
        if new_tokens:
            return new_tokens["access_token"], new_tokens
        return None
    
    return tokens["access_token"], tokens


async def list_calendars(access_token: str) -> list[dict]:
    """List all calendars for the authenticated user."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{GOOGLE_CALENDAR_API}/users/me/calendarList",
                headers={"Authorization": f"Bearer {access_token}"},
            )
        
        if response.status_code != 200:
            log_error("calendar", f"list calendars failed: {response.text[:100]}")
            return []
        
        data = response.json()
        return [
            {"id": cal["id"], "name": cal.get("summary", cal["id"]), "primary": cal.get("primary", False)}
            for cal in data.get("items", [])
        ]
    except Exception as e:
        log_error("calendar", f"list calendars error: {str(e)[:80]}")
        return []


async def get_busy_times(
    access_token: str,
    calendar_id: str,
    start_time: datetime,
    end_time: datetime,
    timezone: str = "Asia/Jerusalem"
) -> list[tuple[datetime, datetime]]:
    """Get busy time slots from Google Calendar."""
    try:
        # Convert to UTC for Google API
        from zoneinfo import ZoneInfo
        utc = ZoneInfo("UTC")
        
        if start_time.tzinfo is not None:
            start_utc = start_time.astimezone(utc)
            end_utc = end_time.astimezone(utc)
        else:
            # Assume local timezone
            tz = ZoneInfo(timezone)
            start_utc = start_time.replace(tzinfo=tz).astimezone(utc)
            end_utc = end_time.replace(tzinfo=tz).astimezone(utc)
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{GOOGLE_CALENDAR_API}/freeBusy",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json={
                    "timeMin": start_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "timeMax": end_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "timeZone": timezone,
                    "items": [{"id": calendar_id}],
                },
            )
        
        if response.status_code != 200:
            log_error("calendar", f"freeBusy failed: {response.text[:100]}")
            return []
        
        data = response.json()
        busy_slots = data.get("calendars", {}).get(calendar_id, {}).get("busy", [])
        
        return [
            (
                datetime.fromisoformat(slot["start"].replace("Z", "+00:00")),
                datetime.fromisoformat(slot["end"].replace("Z", "+00:00"))
            )
            for slot in busy_slots
        ]
    except Exception as e:
        log_error("calendar", f"freeBusy error: {str(e)[:80]}")
        return []


async def create_event(
    access_token: str,
    calendar_id: str,
    title: str,
    start_time: datetime,
    end_time: datetime,
    description: str = "",
    timezone: str = "Asia/Jerusalem"
) -> Optional[str]:
    """Create a calendar event. Returns event ID or None."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{GOOGLE_CALENDAR_API}/calendars/{calendar_id}/events",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json={
                    "summary": title,
                    "description": description,
                    "start": {
                        "dateTime": start_time.isoformat(),
                        "timeZone": timezone,
                    },
                    "end": {
                        "dateTime": end_time.isoformat(),
                        "timeZone": timezone,
                    },
                },
            )
        
        if response.status_code not in (200, 201):
            log_error("calendar", f"create event failed: {response.text[:100]}")
            return None
        
        data = response.json()
        return data.get("id")
    except Exception as e:
        log_error("calendar", f"create event error: {str(e)[:80]}")
        return None


async def update_event(
    access_token: str,
    calendar_id: str,
    event_id: str,
    title: str = None,
    start_time: datetime = None,
    end_time: datetime = None,
    description: str = None,
    timezone: str = "Asia/Jerusalem"
) -> bool:
    """Update a calendar event."""
    try:
        # First get the existing event
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{GOOGLE_CALENDAR_API}/calendars/{calendar_id}/events/{event_id}",
                headers={"Authorization": f"Bearer {access_token}"},
            )
        
        if response.status_code != 200:
            return False
        
        event = response.json()
        
        # Update fields
        if title:
            event["summary"] = title
        if description is not None:
            event["description"] = description
        if start_time:
            event["start"] = {"dateTime": start_time.isoformat(), "timeZone": timezone}
        if end_time:
            event["end"] = {"dateTime": end_time.isoformat(), "timeZone": timezone}
        
        # Save
        async with httpx.AsyncClient() as client:
            response = await client.put(
                f"{GOOGLE_CALENDAR_API}/calendars/{calendar_id}/events/{event_id}",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json",
                },
                json=event,
            )
        
        return response.status_code == 200
    except Exception as e:
        log_error("calendar", f"update event error: {str(e)[:80]}")
        return False


async def delete_event(access_token: str, calendar_id: str, event_id: str) -> bool:
    """Delete a calendar event."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.delete(
                f"{GOOGLE_CALENDAR_API}/calendars/{calendar_id}/events/{event_id}",
                headers={"Authorization": f"Bearer {access_token}"},
            )
        
        return response.status_code in (200, 204)
    except Exception as e:
        log_error("calendar", f"delete event error: {str(e)[:80]}")
        return False
