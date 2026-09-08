from __future__ import annotations

from typing import Optional

from backend.auth import service as auth_service
from backend.core.channel_types import CHANNEL_DISPLAY_NAMES
from backend.core.config import settings
from backend.core.oauth_state import create_oauth_state
from backend.mcp.ctx import (
    current_user,
    db_session,
    fail,
    require_admin,
    require_agent,
    require_confirm,
    require_super,
)
from backend.models.channel_user import ChannelUser
from backend.models.conversation import Conversation
from backend.models.user import User
from backend.services.channels import providers
from backend.services.channels.agent_channels import get_all_channels, get_channel
from backend.services.entities import agents as agents_service
from backend.services.entities import conversations, users
from backend.services.media import agent_media
from backend.services.messaging import messages
from backend.services.meta.oauth import get_instagram_oauth_url, get_oauth_url
from backend.services.scheduling import calendar as google_calendar


def register(mcp) -> None:
    _conversations(mcp)
    _channels(mcp)


def _require_conversation(db, user, conversation_id):
    if not auth_service.can_access_conversation(db, user, conversation_id):
        raise fail("אין גישה לשיחה")
    conv = conversations.get_by_id(db, conversation_id)
    if not conv:
        raise fail("שיחה לא נמצאה")
    return conv


async def _deliver(db, conv, agent, contact, text: str) -> bool:
    if conv.channel_id:
        channel = get_channel(db, conv.channel_id)
        if not channel or not channel.is_active:
            raise fail("ערוץ לא פעיל")
        recipient = contact.phone
        if conv.channel_user_id:
            cu = db.get(ChannelUser, conv.channel_user_id)
            if cu:
                recipient = cu.external_id
        return await providers.send_channel_message(channel, recipient, text, db)
    return await providers.send_message(agent, contact.phone, text)


def _conversations(mcp) -> None:
    @mcp.tool()
    def list_conversations(agent_id: int, limit: int = 30) -> list[dict]:
        """Recent conversations for an agent."""
        with db_session() as db:
            user = current_user(db)
            require_agent(db, user, agent_id)
            capped = max(1, min(100, int(limit)))
            rows = (
                db.query(Conversation, User)
                .join(User, User.id == Conversation.user_id)
                .filter(Conversation.agent_id == agent_id)
                .order_by(Conversation.updated_at.desc())
                .limit(capped)
                .all()
            )
            return [
                {
                    "id": conv.id,
                    "user_name": contact.name,
                    "user_phone": contact.phone,
                    "is_paused": conv.is_paused,
                    "channel_type": conv.channel_type_snapshot,
                    "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
                }
                for conv, contact in rows
            ]

    @mcp.tool()
    def get_conversation_messages(conversation_id: int, limit: int = 50) -> dict:
        """Messages in a conversation the user can access."""
        with db_session() as db:
            user = current_user(db)
            conv = _require_conversation(db, user, conversation_id)
            capped = max(1, min(200, int(limit)))
            return {
                "id": conv.id,
                "agent_id": conv.agent_id,
                "is_paused": conv.is_paused,
                "messages": messages.get_history(db, conversation_id, limit=capped),
            }

    @mcp.tool()
    def pause_conversation(conversation_id: int) -> dict:
        """Pause AI replies on a conversation."""
        with db_session() as db:
            user = current_user(db)
            _require_conversation(db, user, conversation_id)
            conv = conversations.set_paused(db, conversation_id, True)
            if not conv:
                raise fail("שיחה לא נמצאה")
            return {"status": "paused", "id": conversation_id}

    @mcp.tool()
    def resume_conversation(conversation_id: int) -> dict:
        """Resume AI replies on a conversation."""
        with db_session() as db:
            user = current_user(db)
            _require_conversation(db, user, conversation_id)
            conv = conversations.set_paused(db, conversation_id, False)
            if not conv:
                raise fail("שיחה לא נמצאה")
            return {"status": "resumed", "id": conversation_id}

    @mcp.tool()
    async def send_message(conversation_id: int, text: str, confirm: bool = False) -> dict:
        """Send a real message to the customer. Requires confirm=true."""
        require_confirm(confirm, "שליחת הודעה ללקוח")
        if not (text or "").strip():
            raise fail("טקסט חובה")
        with db_session() as db:
            user = current_user(db)
            conv = _require_conversation(db, user, conversation_id)
            agent = agents_service.get_by_id(db, conv.agent_id)
            contact = users.get_by_id(db, conv.user_id)
            if not agent or not contact:
                raise fail("סוכן או לקוח לא נמצאו")
            if not agent.is_active:
                raise fail("הסוכן כבוי")
            ok = await _deliver(db, conv, agent, contact, text.strip())
            if not ok:
                raise fail("שליחה נכשלה")
            msg = messages.add(db, conversation_id, "assistant", text.strip(), message_type="manual")
            return {"status": "sent", "message_id": msg.id}

    @mcp.tool()
    def delete_conversation(conversation_id: int, confirm: bool = False) -> dict:
        """Delete a conversation. Requires confirm=true."""
        with db_session() as db:
            user = current_user(db)
            _require_conversation(db, user, conversation_id)
            require_confirm(confirm, "מחיקת שיחה")
            if not conversations.delete(db, conversation_id):
                raise fail("שיחה לא נמצאה")
            return {"status": "deleted", "id": conversation_id}


def _channels(mcp) -> None:
    @mcp.tool()
    def list_channels(agent_id: int) -> list[dict]:
        """Connected channels for an agent (no tokens). Admin or super-admin."""
        with db_session() as db:
            user = current_user(db)
            require_admin(user)
            require_agent(db, user, agent_id)
            return [
                {
                    "id": ch.id,
                    "channel_type": ch.channel_type,
                    "display_name": CHANNEL_DISPLAY_NAMES.get(ch.channel_type, ch.channel_type),
                    "account_name": ch.account_name,
                    "is_active": ch.is_active,
                    "health_status": ch.health_status,
                }
                for ch in get_all_channels(db, agent_id)
            ]

    @mcp.tool()
    def list_media(agent_id: int, media_type: Optional[str] = None) -> list[dict]:
        """List uploaded media metadata (no binary upload)."""
        with db_session() as db:
            user = current_user(db)
            require_agent(db, user, agent_id)
            if media_type and media_type not in {"image", "video", "document"}:
                raise fail("media_type חייב להיות image, video או document")
            items = agent_media.get_by_agent(db, agent_id, media_type)
            return [
                {
                    "id": m.id,
                    "media_type": m.media_type,
                    "name": m.name,
                    "description": m.description,
                    "file_url": m.file_url,
                    "is_active": m.is_active,
                }
                for m in items
            ]

    @mcp.tool()
    def get_calendar_oauth_url(agent_id: int) -> dict:
        """Google Calendar OAuth URL. User must open it in a browser; MCP cannot finish OAuth."""
        with db_session() as db:
            user = current_user(db)
            require_agent(db, user, agent_id)
            base = (settings.oauth_redirect_base or "").rstrip("/")
            if not base:
                raise fail("חסר oauth_redirect_base בשרת")
            redirect_uri = f"{base}/api/calendar/callback"
            url = google_calendar.get_oauth_url(redirect_uri, str(agent_id))
            return {"url": url, "open_in_browser": True}

    @mcp.tool()
    def get_channel_oauth_url(agent_id: int, channel_type: str) -> dict:
        """Meta OAuth URL for instagram | messenger | whatsapp_meta. Super-admin only. Open in a browser."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            require_agent(db, user, agent_id)
            if not settings.meta_configured:
                raise fail("אפליקציית Meta לא מוגדרת")
            if channel_type not in {"instagram", "messenger", "whatsapp_meta"}:
                raise fail("channel_type חייב להיות instagram, messenger או whatsapp_meta")
            redirect_uri = (
                f"{settings.oauth_redirect_base or settings.frontend_url}/api/channels/oauth-callback"
            )
            state = create_oauth_state(agent_id, channel_type)
            if channel_type == "instagram":
                url = get_instagram_oauth_url(redirect_uri, state)
            else:
                url = get_oauth_url(redirect_uri, state)
            return {"url": url, "open_in_browser": True}
