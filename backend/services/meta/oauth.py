"""Meta OAuth service — parallel to backend/services/calendar.py.

Handles OAuth2 flow for connecting Meta channels (WhatsApp, Instagram, Messenger)
to agents using Optive's central Meta App.

Flow:
  1. super-admin clicks "Connect Instagram" → GET /api/agents/{id}/channels/oauth-url
  2. Redirected to Meta OAuth dialog with signed state
  3. Meta redirects back to /api/channels/oauth-callback?code=...&state=...
  4. Backend verifies state, exchanges code, lists available Pages/WABAs
  5. super-admin selects Page → POST /api/agents/{id}/channels
  6. Channel created with Fernet-encrypted credentials
"""
from datetime import datetime, timedelta
from typing import Optional
from urllib.parse import urlencode

import httpx

from backend.core.config import settings
from backend.core.logger import log_error


META_GRAPH_URL = "https://graph.facebook.com/v20.0"
META_AUTH_URL = "https://www.facebook.com/v20.0/dialog/oauth"
META_TOKEN_URL = f"{META_GRAPH_URL}/oauth/access_token"

# Permissions needed for all channels
META_SCOPES = [
    "whatsapp_business_management",
    "whatsapp_business_messaging",
    "pages_messaging",
    "pages_show_list",
    "pages_read_engagement",
    "pages_manage_metadata",
    "instagram_business_basic",
    "instagram_business_manage_messages",
    "instagram_manage_comments",
    "business_management",
]


def get_oauth_url(redirect_uri: str, state: str) -> str:
    """Generate Meta OAuth URL with signed state."""
    params = {
        "client_id": settings.meta_app_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "scope": ",".join(META_SCOPES),
        "response_type": "code",
    }
    return f"{META_AUTH_URL}?{urlencode(params)}"


async def exchange_code_for_tokens(code: str, redirect_uri: str) -> Optional[dict]:
    """Exchange auth code for a long-lived user access token.

    Returns dict with access_token, token_expires_at, scopes or None on failure.
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # 1. Short-lived user token
            resp = await client.get(META_TOKEN_URL, params={
                "client_id": settings.meta_app_id,
                "client_secret": settings.meta_app_secret,
                "redirect_uri": redirect_uri,
                "code": code,
            })
        if resp.status_code != 200:
            log_error("meta_oauth", f"code exchange failed: {resp.text[:200]}")
            return None

        data = resp.json()
        short_token = data.get("access_token")
        if not short_token:
            return None

        # 2. Exchange for long-lived token
        long_lived = await _exchange_for_long_lived(short_token)
        return long_lived

    except Exception as e:
        log_error("meta_oauth", f"exchange_code_for_tokens: {e}")
        return None


async def _exchange_for_long_lived(short_token: str) -> Optional[dict]:
    """Exchange a short-lived token for a 60-day long-lived token."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(META_TOKEN_URL, params={
                "grant_type": "fb_exchange_token",
                "client_id": settings.meta_app_id,
                "client_secret": settings.meta_app_secret,
                "fb_exchange_token": short_token,
            })
        if resp.status_code != 200:
            log_error("meta_oauth", f"long-lived exchange failed: {resp.text[:200]}")
            return None
        data = resp.json()
        expires_in = data.get("expires_in", 5183944)  # ~60 days
        return {
            "access_token": data["access_token"],
            "token_expires_at": (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat(),
            "scopes": META_SCOPES,
        }
    except Exception as e:
        log_error("meta_oauth", f"_exchange_for_long_lived: {e}")
        return None


async def refresh_token(user_access_token: str) -> Optional[dict]:
    """Refresh a long-lived token (returns new long-lived token)."""
    return await _exchange_for_long_lived(user_access_token)


async def get_user_pages(access_token: str) -> list[dict]:
    """List Facebook Pages the user manages.

    Returns list of {id, name, access_token, instagram_business_account}.
    """
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
    """Subscribe a page to Optive's webhooks."""
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
