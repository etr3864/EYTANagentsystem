"""Meta OAuth service — parallel to backend/services/calendar.py.

Handles OAuth2 flow for connecting Meta channels to agents.

Two separate flows:
  - Instagram Business Login: instagram.com/oauth/authorize
    Scopes: instagram_business_basic, instagram_business_manage_messages
    Token host: graph.instagram.com
  - Facebook Login (Messenger / WhatsApp Meta): facebook.com/dialog/oauth
    Scopes: pages_messaging, whatsapp_business_*
    Token host: graph.facebook.com

Flow for both:
  1. super-admin clicks "Connect {channel}" → GET /api/agents/{id}/channels/oauth-url
  2. Redirected to appropriate OAuth dialog with signed state
  3. Meta redirects back to /api/channels/oauth-callback?code=...&state=...
  4. Backend verifies state, exchanges code, lists available accounts/pages
  5. super-admin selects account → POST /api/agents/{id}/channels
  6. Channel created with Fernet-encrypted credentials
"""
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode

import httpx

from backend.core.config import settings
from backend.core.logger import log_error


# ── Facebook Login (Messenger, WhatsApp) ─────────────────────────────────────

META_GRAPH_URL = "https://graph.facebook.com/v20.0"
META_AUTH_URL = "https://www.facebook.com/v20.0/dialog/oauth"
META_TOKEN_URL = f"{META_GRAPH_URL}/oauth/access_token"

META_SCOPES = [
    "whatsapp_business_management",
    "whatsapp_business_messaging",
    "pages_messaging",
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_metadata",
    "business_management",
]


def get_oauth_url(redirect_uri: str, state: str) -> str:
    """Generate Facebook Login OAuth URL for Messenger/WhatsApp."""
    params = {
        "client_id": settings.meta_app_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "scope": ",".join(META_SCOPES),
        "response_type": "code",
    }
    return f"{META_AUTH_URL}?{urlencode(params)}"


async def exchange_code_for_tokens(code: str, redirect_uri: str) -> Optional[dict]:
    """Exchange Facebook Login auth code for a long-lived token."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(META_TOKEN_URL, params={
                "client_id": settings.meta_app_id,
                "client_secret": settings.meta_app_secret,
                "redirect_uri": redirect_uri,
                "code": code,
            })
        if resp.status_code != 200:
            log_error("meta_oauth", f"FB code exchange failed: {resp.text[:200]}")
            return None

        data = resp.json()
        short_token = data.get("access_token")
        if not short_token:
            return None

        return await _exchange_fb_long_lived(short_token)

    except Exception as e:
        log_error("meta_oauth", f"exchange_code_for_tokens: {e}")
        return None


async def _exchange_fb_long_lived(short_token: str) -> Optional[dict]:
    """Exchange a short-lived Facebook token for a 60-day long-lived token."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(META_TOKEN_URL, params={
                "grant_type": "fb_exchange_token",
                "client_id": settings.meta_app_id,
                "client_secret": settings.meta_app_secret,
                "fb_exchange_token": short_token,
            })
        if resp.status_code != 200:
            log_error("meta_oauth", f"FB long-lived exchange failed: {resp.text[:200]}")
            return None
        data = resp.json()
        expires_in = data.get("expires_in", 5183944)
        return {
            "access_token": data["access_token"],
            "token_expires_at": (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat(),
            "scopes": META_SCOPES,
        }
    except Exception as e:
        log_error("meta_oauth", f"_exchange_fb_long_lived: {e}")
        return None


async def refresh_token(user_access_token: str) -> Optional[dict]:
    """Refresh a long-lived Facebook token."""
    return await _exchange_fb_long_lived(user_access_token)


async def get_user_pages(access_token: str) -> list[dict]:
    """List Facebook Pages the user manages (for Messenger/WhatsApp)."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{META_GRAPH_URL}/me/accounts",
                params={
                    "access_token": access_token,
                    "fields": "id,name,access_token,instagram_business_account{id,name,username}",
                },
            )
        if resp.status_code != 200:
            log_error("meta_oauth", f"get_user_pages: {resp.text[:200]}")
            return []
        return resp.json().get("data", [])
    except Exception as e:
        log_error("meta_oauth", f"get_user_pages: {e}")
        return []


async def get_waba_accounts(access_token: str) -> list[dict]:
    """List WhatsApp Business Accounts accessible to this token."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{META_GRAPH_URL}/me/businesses",
                params={"access_token": access_token, "fields": "id,name,whatsapp_business_accounts"},
            )
        if resp.status_code != 200:
            log_error("meta_oauth", f"get_waba_accounts: {resp.text[:200]}")
            return []
        businesses = resp.json().get("data", [])
        wabas = []
        for biz in businesses:
            for waba in biz.get("whatsapp_business_accounts", {}).get("data", []):
                wabas.append({
                    "id": waba["id"],
                    "name": waba.get("name", ""),
                    "business_name": biz.get("name", ""),
                })
        return wabas
    except Exception as e:
        log_error("meta_oauth", f"get_waba_accounts: {e}")
        return []


async def subscribe_page_to_app(page_id: str, page_access_token: str) -> bool:
    """Subscribe a Facebook Page to Optive's webhooks (Messenger/WhatsApp)."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{META_GRAPH_URL}/{page_id}/subscribed_apps",
                params={
                    "access_token": page_access_token,
                    "subscribed_fields": "messages,messaging_postbacks,message_deliveries",
                },
            )
        return resp.status_code == 200 and resp.json().get("success", False)
    except Exception as e:
        log_error("meta_oauth", f"subscribe_page_to_app: {e}")
        return False


# ── Instagram Business Login ───────────────────────────────────────────────────

INSTAGRAM_AUTH_URL = "https://www.instagram.com/oauth/authorize"
INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token"
INSTAGRAM_LONG_LIVED_URL = "https://graph.instagram.com/access_token"
INSTAGRAM_GRAPH_URL = "https://graph.instagram.com/v20.0"

INSTAGRAM_SCOPES = [
    "instagram_business_basic",
    "instagram_business_manage_messages",
]


def get_instagram_oauth_url(redirect_uri: str, state: str) -> str:
    """Generate Instagram Business Login OAuth URL."""
    params = {
        "client_id": settings.meta_instagram_app_id or settings.meta_app_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "scope": ",".join(INSTAGRAM_SCOPES),
        "response_type": "code",
    }
    return f"{INSTAGRAM_AUTH_URL}?{urlencode(params)}"


async def exchange_instagram_code(code: str, redirect_uri: str) -> Optional[dict]:
    """Exchange Instagram Business Login auth code for a long-lived token."""
    ig_client_id = settings.meta_instagram_app_id or settings.meta_app_id
    ig_secret = settings.meta_instagram_app_secret or settings.meta_app_secret
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(INSTAGRAM_TOKEN_URL, data={
                "client_id": ig_client_id,
                "client_secret": ig_secret,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
                "code": code,
            })
        if resp.status_code != 200:
            log_error("ig_oauth", f"IG code exchange failed ({resp.status_code}): {resp.text[:300]}")
            return None

        data = resp.json()
        short_token = data.get("access_token")
        if not short_token:
            return None

        return await _exchange_ig_long_lived(short_token)

    except Exception as e:
        log_error("ig_oauth", f"exchange_instagram_code: {e}")
        return None


async def _exchange_ig_long_lived(short_token: str) -> Optional[dict]:
    """Exchange a short-lived Instagram token for a 60-day long-lived token."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(INSTAGRAM_LONG_LIVED_URL, params={
                "grant_type": "ig_exchange_token",
                "client_secret": settings.meta_instagram_app_secret or settings.meta_app_secret,
                "access_token": short_token,
            })
        if resp.status_code != 200:
            log_error("ig_oauth", f"IG long-lived exchange failed: {resp.text[:200]}")
            return None
        data = resp.json()
        expires_in = data.get("expires_in", 5183944)
        return {
            "access_token": data["access_token"],
            "token_expires_at": (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat(),
            "scopes": INSTAGRAM_SCOPES,
        }
    except Exception as e:
        log_error("ig_oauth", f"_exchange_ig_long_lived: {e}")
        return None


async def refresh_instagram_token(access_token: str) -> Optional[dict]:
    """Refresh a long-lived Instagram token (valid for 60 days, refreshable up to 1 year)."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{INSTAGRAM_GRAPH_URL}/refresh_access_token",
                params={
                    "grant_type": "ig_refresh_token",
                    "access_token": access_token,
                },
            )
        if resp.status_code != 200:
            log_error("ig_oauth", f"IG token refresh failed: {resp.text[:200]}")
            return None
        data = resp.json()
        expires_in = data.get("expires_in", 5183944)
        return {
            "access_token": data["access_token"],
            "token_expires_at": (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat(),
        }
    except Exception as e:
        log_error("ig_oauth", f"refresh_instagram_token: {e}")
        return None


async def get_instagram_accounts(access_token: str) -> list[dict]:
    """Get the Instagram account connected to this token.

    Returns a list with a single item in the same shape as get_user_pages()
    so the frontend page-selector works without changes.
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{INSTAGRAM_GRAPH_URL}/me",
                params={
                    "access_token": access_token,
                    "fields": "user_id,name,username,profile_picture_url",
                },
            )
        if resp.status_code != 200:
            log_error("ig_oauth", f"get_instagram_accounts: {resp.text[:200]}")
            return []
        data = resp.json()
        ig_id = data.get("user_id") or data.get("id", "")
        name = data.get("name", "")
        username = data.get("username", "")
        return [{
            "id": ig_id,
            "name": username or name,
            "access_token": access_token,
            "instagram_business_account": {
                "id": ig_id,
                "name": name,
                "username": username,
            },
        }]
    except Exception as e:
        log_error("ig_oauth", f"get_instagram_accounts: {e}")
        return []
