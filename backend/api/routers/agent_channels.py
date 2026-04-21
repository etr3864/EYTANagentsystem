"""Agent channels management API.

Endpoints for connecting / disconnecting / listing channels per agent.
Super-admin only for write operations; admin can view in read-only.

OAuth flow (parallel to /calendar OAuth):
  1. GET  /api/agents/{id}/channels/oauth-url  → redirect to Meta
  2. GET  /api/channels/oauth-callback          → exchange code, list pages
  3. POST /api/agents/{id}/channels             → create channel with page selection
  4. PATCH /api/channels/{id}                   → toggle is_active
  5. DELETE /api/channels/{id}                  → remove channel
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_user, require_super_admin
from backend.auth.models import AuthUser, UserRole
from backend.core.config import settings
from backend.core.database import get_db
from backend.core.channel_types import CHANNEL_DISPLAY_NAMES
from backend.core.oauth_state import create_oauth_state, verify_oauth_state
from backend.models.agent_channel import AgentChannel
from backend.services.entities import agents
from backend.services.channels.agent_channels import (
    get_active_channels,
    get_all_channels,
    add_channel,
    toggle_active,
    get_channel,
    get_credentials,
    update_credentials,
    ChannelConflictError,
    ChannelNotFoundError,
)
from backend.services.meta.oauth import (
    get_oauth_url,
    get_instagram_oauth_url,
    exchange_code_for_tokens,
    exchange_instagram_code,
    get_user_pages,
    get_instagram_accounts,
    subscribe_page_to_app,
)

router = APIRouter(tags=["channels"])

_super_admin = Depends(require_super_admin())


# ── Schemas ───────────────────────────────────────────────────────────────────

class ChannelResponse(BaseModel):
    id: int
    agent_id: int
    channel_type: str
    channel_display_name: str
    external_account_id: str
    account_name: Optional[str] = None
    page_id: Optional[str]
    waba_id: Optional[str]
    is_active: bool
    health_status: str
    last_health_check_at: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


class AddChannelRequest(BaseModel):
    channel_type: str                   # "instagram" | "messenger" | "whatsapp_meta" | "whatsapp_wasender"
    access_token: str                   # Meta OAuth token OR WaSender API key
    external_account_id: str            # phone_number_id / ig_account_id / page_id / wasender session
    account_name: Optional[str] = None  # IG username / Page name
    page_id: Optional[str] = None
    waba_id: Optional[str] = None
    wasender_secret: Optional[str] = None  # WaSender webhook secret (optional)
    token_expires_at: Optional[str] = None  # ISO datetime for Meta token expiry


class ToggleChannelRequest(BaseModel):
    is_active: bool


class UpdateWaSenderRequest(BaseModel):
    api_key: Optional[str] = None
    session: Optional[str] = None
    webhook_secret: Optional[str] = None
    external_account_id: Optional[str] = None


def _serialize_channel(ch: AgentChannel) -> ChannelResponse:
    return ChannelResponse(
        id=ch.id,
        agent_id=ch.agent_id,
        channel_type=ch.channel_type,
        channel_display_name=CHANNEL_DISPLAY_NAMES.get(ch.channel_type, ch.channel_type),
        external_account_id=ch.external_account_id,
        account_name=ch.account_name,
        page_id=ch.page_id,
        waba_id=ch.waba_id,
        is_active=ch.is_active,
        health_status=ch.health_status,
        last_health_check_at=ch.last_health_check_at.isoformat() if ch.last_health_check_at else None,
        created_at=ch.created_at.isoformat(),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/agents/{agent_id}/channels")
async def list_channels(
    agent_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = Depends(get_current_user),
):
    """List all active channels for an agent (admin read-only, super-admin full access)."""
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if current_user.role not in (UserRole.SUPER_ADMIN, UserRole.ADMIN):
        raise HTTPException(status_code=403, detail="Not authorized")

    channels = get_all_channels(db, agent_id)
    return [_serialize_channel(ch) for ch in channels]


@router.get("/agents/{agent_id}/channels/oauth-url")
async def get_channel_oauth_url(
    agent_id: int,
    channel_type: str = Query(..., description="instagram | messenger | whatsapp_meta"),
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    """Generate a Meta OAuth URL for connecting a channel (super-admin only)."""
    if not settings.meta_configured:
        raise HTTPException(status_code=503, detail="Meta App not configured")

    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    state = create_oauth_state(agent_id, channel_type)
    redirect_uri = f"{settings.oauth_redirect_base or settings.frontend_url}/api/channels/oauth-callback"

    if channel_type == "instagram":
        url = get_instagram_oauth_url(redirect_uri, state)
    else:
        url = get_oauth_url(redirect_uri, state)

    return {"url": url}


@router.get("/channels/oauth-callback")
async def oauth_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db),
):
    """Handle Meta OAuth callback.

    Verifies signed state, exchanges code, lists available pages.
    Stores result in Redis for 5 minutes then redirects to frontend page-selector.
    """
    import uuid, json
    import redis.asyncio as aioredis
    from fastapi.responses import RedirectResponse

    try:
        state_data = verify_oauth_state(state)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    agent_id = state_data["agent_id"]
    channel_type = state_data["channel_type"]

    redirect_uri = f"{settings.oauth_redirect_base or settings.frontend_url}/api/channels/oauth-callback"

    if channel_type == "instagram":
        tokens = await exchange_instagram_code(code, redirect_uri)
    else:
        tokens = await exchange_code_for_tokens(code, redirect_uri)

    if not tokens:
        frontend_error_url = f"{settings.frontend_url}/agent/{agent_id}?tab=channels&error=oauth_failed"
        return RedirectResponse(frontend_error_url)

    if channel_type == "instagram":
        pages = await get_instagram_accounts(tokens["access_token"])
    elif channel_type == "whatsapp_meta":
        from backend.services.meta.oauth import get_waba_phone_numbers
        pages = await get_waba_phone_numbers(tokens["access_token"])
    else:
        pages = await get_user_pages(tokens["access_token"])

    session_id = str(uuid.uuid4())
    session_data = json.dumps({
        "agent_id": agent_id,
        "channel_type": channel_type,
        "access_token": tokens["access_token"],
        "token_expires_at": tokens.get("token_expires_at"),
        "pages": pages,
    })

    try:
        r = aioredis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
        await r.setex(f"oauth_session:{session_id}", 300, session_data)
        await r.aclose()
    except Exception:
        # Fallback: encode in URL (less ideal but functional)
        import base64
        encoded = base64.urlsafe_b64encode(session_data.encode()).decode()
        return RedirectResponse(
            f"{settings.frontend_url}/channels/oauth-callback?fallback=1&data={encoded}"
        )

    return RedirectResponse(
        f"{settings.frontend_url}/channels/oauth-callback?session={session_id}"
    )


@router.get("/channels/oauth-session/{session_id}")
async def get_oauth_session(session_id: str):
    """Retrieve and consume a one-time OAuth session stored in Redis.

    Called by the frontend page-selector after redirect.
    TTL: 5 minutes. Deleted on first successful read.
    """
    import json
    import redis.asyncio as aioredis

    try:
        r = aioredis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)
        raw = await r.get(f"oauth_session:{session_id}")
        if raw:
            await r.delete(f"oauth_session:{session_id}")
        await r.aclose()
    except Exception:
        raise HTTPException(status_code=503, detail="Redis unavailable")

    if not raw:
        raise HTTPException(status_code=404, detail="Session expired or not found")

    return json.loads(raw)


@router.post("/agents/{agent_id}/channels")
async def create_channel(
    agent_id: int,
    body: AddChannelRequest,
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    """Connect a new channel to an agent (super-admin only).

    Uses pg_advisory_xact_lock for mutex enforcement.
    """
    agent = agents.get_by_id(db, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if body.channel_type == "whatsapp_wasender":
        credentials = {
            "api_key": body.access_token,
            "session": body.external_account_id or "default",
            "webhook_secret": body.wasender_secret or "",
        }
    else:
        credentials: dict = {
            "access_token": body.access_token,
            "scopes": [],
        }
        if body.token_expires_at:
            credentials["token_expires_at"] = body.token_expires_at

    try:
        channel = add_channel(
            db=db,
            agent_id=agent_id,
            channel_type=body.channel_type,
            external_account_id=body.external_account_id or "default",
            credentials=credentials,
            page_id=body.page_id,
            waba_id=body.waba_id,
            account_name=body.account_name,
        )
        db.commit()
    except ChannelConflictError as e:
        raise HTTPException(status_code=409, detail=str(e))

    # Subscribe page to webhooks (best effort)
    if body.page_id and body.channel_type in ("instagram", "messenger"):
        await subscribe_page_to_app(body.page_id, body.access_token)

    # Auto-enable Business Assistant mode for Meta channels
    if body.channel_type in ("instagram", "messenger", "whatsapp_meta"):
        if not agent.business_assistant_mode:
            agent.business_assistant_mode = True
            db.commit()

    return _serialize_channel(channel)


@router.patch("/channels/{channel_id}")
async def update_channel(
    channel_id: int,
    body: ToggleChannelRequest,
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    """Toggle is_active for a channel (super-admin only)."""
    try:
        channel = toggle_active(db, channel_id, body.is_active)
        db.commit()
        return _serialize_channel(channel)
    except ChannelNotFoundError:
        raise HTTPException(status_code=404, detail="Channel not found")


@router.put("/channels/{channel_id}/credentials")
async def update_channel_credentials(
    channel_id: int,
    body: UpdateWaSenderRequest,
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    """Update credentials for a WaSender channel (super-admin only)."""
    channel = get_channel(db, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    if channel.channel_type != "whatsapp_wasender":
        raise HTTPException(status_code=400, detail="Credential editing is only supported for WaSender channels")

    try:
        current_creds = get_credentials(channel)
    except Exception:
        current_creds = {}

    if body.api_key is not None:
        current_creds["api_key"] = body.api_key
    if body.session is not None:
        current_creds["session"] = body.session
    if body.webhook_secret is not None:
        current_creds["webhook_secret"] = body.webhook_secret

    update_credentials(db, channel, current_creds)

    if body.external_account_id is not None:
        channel.external_account_id = body.external_account_id

    db.commit()
    return _serialize_channel(channel)


@router.delete("/channels/{channel_id}")
async def delete_channel(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    """Remove a channel (super-admin only).

    Raises 409 if the channel has active conversations (ON DELETE RESTRICT).
    """
    channel = get_channel(db, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    try:
        db.delete(channel)
        db.commit()
        return {"status": "deleted", "channel_id": channel_id}
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Cannot delete channel with existing conversations. Disable it instead."
        )


@router.get("/channels/{channel_id}/health")
async def channel_health(
    channel_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    """Check and refresh health status for a channel."""
    channel = get_channel(db, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    if channel.channel_type == "whatsapp_wasender":
        return {"channel_id": channel_id, "health_status": "not_checked", "message": "WaSender health check not implemented"}

    try:
        creds = get_credentials(channel)
        import httpx
        if channel.channel_type == "instagram":
            url = "https://graph.instagram.com/v20.0/me"
        else:
            url = "https://graph.facebook.com/v20.0/me"
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(url, params={"access_token": creds.get("access_token", "")})
        status_val = "healthy" if resp.status_code == 200 else "degraded"
    except Exception:
        status_val = "error"

    from backend.services.channels.agent_channels import update_health
    update_health(db, channel, status_val)
    db.commit()

    return {
        "channel_id": channel_id,
        "health_status": status_val,
        "last_checked": channel.last_health_check_at.isoformat() if channel.last_health_check_at else None,
    }
