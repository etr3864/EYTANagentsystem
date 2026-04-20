"""Instagram messaging adapter (Instagram Graph API v20).

Uses graph.instagram.com (Instagram Business Login) rather than
graph.facebook.com. The send-message endpoint and token type changed
with the Instagram API with Instagram Login migration.
"""
import httpx
from typing import Optional

from backend.core.logger import log_error

META_GRAPH_URL = "https://graph.instagram.com/v20.0"


async def get_user_profile(access_token: str, user_id: str) -> Optional[dict]:
    """Fetch Instagram user profile (name/username) by IGSID.

    Returns {"name": "...", "username": "..."} or None on failure.
    """
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{META_GRAPH_URL}/{user_id}",
                params={"access_token": access_token, "fields": "name,username"},
            )
        if resp.status_code == 200:
            return resp.json()
        return None
    except Exception:
        return None


async def send_message(access_token: str, ig_account_id: str, recipient_id: str, text: str) -> bool:
    """Send a text message via Instagram.

    Args:
        access_token: Page access token.
        ig_account_id: Instagram-connected business account ID.
        recipient_id: Recipient's Instagram-scoped user ID.
        text: Message text (max 1000 chars).
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{META_GRAPH_URL}/{ig_account_id}/messages",
                params={"access_token": access_token},
                json={
                    "recipient": {"id": recipient_id},
                    "message": {"text": text[:1000]},
                    "messaging_type": "RESPONSE",
                },
            )
        if resp.status_code == 200:
            return True
        log_error("instagram", f"send_message failed ({resp.status_code}): {resp.text[:200]}")
        return False
    except Exception as e:
        log_error("instagram", f"send_message exception: {e}")
        return False


async def send_media(
    access_token: str,
    ig_account_id: str,
    recipient_id: str,
    media_url: str,
    media_type: str,
    caption: Optional[str] = None,
) -> bool:
    """Send an image or video via Instagram.

    Instagram DM supports: image, video.
    Files and audio are not supported — caller should fallback to text.
    """
    if media_type not in ("image", "video"):
        log_error("instagram", f"unsupported media_type: {media_type}")
        return False

    try:
        attachment = {
            "type": media_type,
            "payload": {"url": media_url, "is_reusable": False},
        }
        message: dict = {"attachment": attachment}
        if caption:
            message["text"] = caption[:500]

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{META_GRAPH_URL}/{ig_account_id}/messages",
                params={"access_token": access_token},
                json={
                    "recipient": {"id": recipient_id},
                    "message": message,
                    "messaging_type": "RESPONSE",
                },
            )
        if resp.status_code == 200:
            return True
        log_error("instagram", f"send_media failed ({resp.status_code}): {resp.text[:200]}")
        return False
    except Exception as e:
        log_error("instagram", f"send_media exception: {e}")
        return False
