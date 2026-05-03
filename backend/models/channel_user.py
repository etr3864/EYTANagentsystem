"""ChannelUser model — channel-specific user identity.

Each channel has its own user ID space:
- WaSender / WA Meta: E.164 phone number or BSUID
- Instagram: IG-scoped user ID
- Messenger: Page-scoped user ID (PSID)

BSUID (Business-Scoped User ID) is Meta's new 2026 identifier for WhatsApp
users. It replaces phone numbers in webhook payloads. Stored separately to
allow atomic upsert when it arrives later.
"""
from datetime import datetime
from typing import Optional, TYPE_CHECKING

from sqlalchemy import String, Text, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from backend.core.database import Base

if TYPE_CHECKING:
    from backend.models.agent_channel import AgentChannel


class ChannelUser(Base):
    __tablename__ = "channel_users"

    id: Mapped[int] = mapped_column(primary_key=True)
    channel_id: Mapped[int] = mapped_column(
        ForeignKey("agent_channels.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # Primary identifier: phone E.164, BSUID, IG user ID, or PSID
    external_id: Mapped[str] = mapped_column(String(200), nullable=False)

    # BSUID — whatsapp_meta only; populated when Meta starts sending it (2026)
    bsuid: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    display_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    profile_pic_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    channel: Mapped["AgentChannel"] = relationship("AgentChannel", back_populates="channel_users")

    __table_args__ = (
        UniqueConstraint("channel_id", "external_id", name="uq_channel_user"),
        Index("ix_channel_users_bsuid", "channel_id", "bsuid", postgresql_where="bsuid IS NOT NULL"),
    )
