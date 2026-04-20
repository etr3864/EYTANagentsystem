"""AgentChannel model — one row per connected channel per agent.

Covers: WaSender, WhatsApp Meta, Instagram, Messenger.
Credentials are stored encrypted (Fernet) in credentials_encrypted.
"""
from datetime import datetime
from typing import Optional, TYPE_CHECKING

from sqlalchemy import String, Boolean, DateTime, ForeignKey, LargeBinary, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.database import Base

if TYPE_CHECKING:
    from backend.models.agent import Agent
    from backend.models.channel_user import ChannelUser


class AgentChannel(Base):
    __tablename__ = "agent_channels"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True)

    # 'whatsapp_wasender' | 'whatsapp_meta' | 'instagram' | 'messenger'
    channel_type: Mapped[str] = mapped_column(String(30), nullable=False)

    # wasender: session_id | meta-wa: phone_number_id | ig: ig_account_id | ms: page_id
    external_account_id: Mapped[str] = mapped_column(String(100), nullable=False)

    # Human-readable name (e.g. IG username, Page name)
    account_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Instagram + Messenger Page ID
    page_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # WhatsApp Meta WABA ID
    waba_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Fernet-encrypted JSON blob:
    # wasender: {"api_key": "...", "session": "...", "webhook_secret": "..."}
    # meta:     {"access_token": "...", "token_expires_at": "...", "scopes": [...]}
    credentials_encrypted: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)

    # WhatsApp Meta verify token (for webhook subscription)
    verify_token: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_health_check_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    health_status: Mapped[str] = mapped_column(String(20), default="unknown")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    agent: Mapped["Agent"] = relationship("Agent", back_populates="channels")
    channel_users: Mapped[list["ChannelUser"]] = relationship("ChannelUser", back_populates="channel", passive_deletes=True)

    __table_args__ = (
        UniqueConstraint("agent_id", "channel_type", name="uq_agent_channel_type"),
        UniqueConstraint("channel_type", "external_account_id", name="uq_channel_account"),
        Index("ix_agent_channels_agent_active", "agent_id", postgresql_where="is_active"),
    )
