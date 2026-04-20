"""Channel user management service.

Handles get-or-create for channel-specific user identities using
atomic ON CONFLICT DO UPDATE to avoid race conditions.
"""
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.models.agent_channel import AgentChannel
from backend.models.channel_user import ChannelUser


@dataclass
class IncomingUserInfo:
    """Normalized user info extracted from an incoming webhook payload."""
    external_id: str          # Phone, IG user ID, PSID, etc.
    bsuid: Optional[str] = None          # WhatsApp BSUID (2026)
    display_name: Optional[str] = None


def get_or_create_for_incoming(
    db: Session,
    channel: AgentChannel,
    user_info: IncomingUserInfo,
) -> int:
    """Atomically upsert a channel user, returning the row ID.

    Uses INSERT ... ON CONFLICT DO UPDATE so that:
    - First message: creates the row
    - Subsequent messages: updates bsuid/display_name if they arrive later
    - No race condition: atomic single SQL statement

    Returns the channel_user.id.
    """
    result = db.execute(
        text("""
            INSERT INTO channel_users (channel_id, external_id, bsuid, display_name, updated_at)
            VALUES (:channel_id, :external_id, :bsuid, :display_name, NOW())
            ON CONFLICT (channel_id, external_id) DO UPDATE
              SET bsuid        = COALESCE(EXCLUDED.bsuid, channel_users.bsuid),
                  display_name = COALESCE(EXCLUDED.display_name, channel_users.display_name),
                  updated_at   = NOW()
            RETURNING id
        """),
        {
            "channel_id": channel.id,
            "external_id": user_info.external_id,
            "bsuid": user_info.bsuid,
            "display_name": user_info.display_name,
        },
    )
    return result.scalar_one()


def get_by_id(db: Session, channel_user_id: int) -> Optional[ChannelUser]:
    return db.query(ChannelUser).filter(ChannelUser.id == channel_user_id).first()


def get_by_external_id(
    db: Session, channel_id: int, external_id: str
) -> Optional[ChannelUser]:
    return (
        db.query(ChannelUser)
        .filter(
            ChannelUser.channel_id == channel_id,
            ChannelUser.external_id == external_id,
        )
        .first()
    )
