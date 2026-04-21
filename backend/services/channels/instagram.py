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
    """Fetch Instagram customer profile by IGSID (Messaging User Profile API).

    Returns {"name", "username", "profile_pic", "follower_count",
             "is_verified_user", "is_user_follow_business"} or None.
    """
    try:
        fields = "name,username,profile_pic,follower_count,is_verified_user,is_user_follow_business"
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{META_GRAPH_URL}/{user_id}",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"fields": fields},
            )
        if resp.status_code == 200:
            return resp.json()
        log_error("instagram", f"profile fetch failed: {resp.status_code} {resp.text[:100]}")
        return None
    except Exception as e:
        log_error("instagram", f"profile fetch error: {e}")
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
                headers={"Authorization": f"Bearer {access_token}"},
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
    """Send media via Instagram DM.

    Supported types: image, video, audio, file (document).
    Caption is sent as a separate text message (IG doesn't support both in one).
    """
    type_map = {
        "image": "image",
        "video": "video",
        "audio": "audio",
        "document": "file",
        "file": "file",
    }
    ig_type = type_map.get(media_type)
    if not ig_type:
        log_error("instagram", f"unsupported media_type: {media_type}")
        return False

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{META_GRAPH_URL}/{ig_account_id}/messages",
                headers={"Authorization": f"Bearer {access_token}"},
                json={
                    "recipient": {"id": recipient_id},
                    "message": {
                        "attachment": {
                            "type": ig_type,
                            "payload": {"url": media_url},
                        }
                    },
                    "messaging_type": "RESPONSE",
                },
            )
        if resp.status_code != 200:
            log_error("instagram", f"send_media failed ({resp.status_code}): {resp.text[:300]}")
            return False

        # Send caption as separate text message if provided
        if caption:
            await send_message(access_token, ig_account_id, recipient_id, caption)

        return True
    except Exception as e:
        log_error("instagram", f"send_media exception: {e}")
        return False
