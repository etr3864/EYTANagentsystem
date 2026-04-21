"""Facebook Messenger messaging adapter (Graph API v22)."""
import httpx
from typing import Optional

from backend.core.logger import log_error

META_GRAPH_URL = "https://graph.facebook.com/v22.0"


async def get_user_profile(access_token: str, psid: str) -> Optional[dict]:
    """Fetch Messenger user profile by PSID.

    Returns {"first_name", "last_name", "profile_pic"} or None.
    """
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{META_GRAPH_URL}/{psid}",
                params={
                    "fields": "first_name,last_name,profile_pic",
                    "access_token": access_token,
                },
            )
        if resp.status_code == 200:
            return resp.json()
        log_error("messenger", f"profile fetch failed: {resp.status_code} {resp.text[:100]}")
        return None
    except Exception as e:
        log_error("messenger", f"profile fetch error: {e}")
        return None


async def send_message(access_token: str, page_id: str, psid: str, text: str) -> bool:
    """Send a text message via Messenger.

    Args:
        access_token: Page access token.
        page_id: Facebook Page ID.
        psid: Recipient's Page-Scoped ID.
        text: Message text.
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{META_GRAPH_URL}/{page_id}/messages",
                params={"access_token": access_token},
                json={
                    "recipient": {"id": psid},
                    "message": {"text": text[:2000]},
                    "messaging_type": "RESPONSE",
                },
            )
        if resp.status_code == 200:
            return True
        log_error("messenger", f"send_message failed ({resp.status_code}): {resp.text[:200]}")
        return False
    except Exception as e:
        log_error("messenger", f"send_message exception: {e}")
        return False


async def send_media(
    access_token: str,
    page_id: str,
    psid: str,
    media_url: str,
    media_type: str,
    caption: Optional[str] = None,
    filename: Optional[str] = None,
) -> bool:
    """Send media (image, video, audio, file) via Messenger."""
    _TYPE_MAP = {
        "image": "image",
        "video": "video",
        "audio": "audio",
        "document": "file",
    }
    att_type = _TYPE_MAP.get(media_type, "file")

    try:
        payload_dict: dict = {"url": media_url}
        if filename:
            payload_dict["filename"] = filename

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{META_GRAPH_URL}/{page_id}/messages",
                params={"access_token": access_token},
                json={
                    "recipient": {"id": psid},
                    "message": {
                        "attachment": {
                            "type": att_type,
                            "payload": payload_dict,
                        }
                    },
                    "messaging_type": "RESPONSE",
                },
            )
        if resp.status_code != 200:
            log_error("messenger", f"send_media failed ({resp.status_code}): {resp.text[:200]}")
            return False

        if caption:
            await send_message(access_token, page_id, psid, caption[:500])

        return True
    except Exception as e:
        log_error("messenger", f"send_media exception: {e}")
        return False
