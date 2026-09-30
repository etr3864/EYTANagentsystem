from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    pause_reason: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    mode: Mapped[str] = mapped_column(String(20), nullable=False, default="template")
    template_body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    column_defaults: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    rephrase_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    writer_model: Mapped[str] = mapped_column(String(50), nullable=False, default="gemini-3.8-flash")
    rephrase_model: Mapped[str] = mapped_column(String(50), nullable=False, default="gemini-3.8-flash")
    media_kind: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    media_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    media_mime: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    media_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    media_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    window_start: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    window_end: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Asia/Jerusalem")
    skip_recent_amount: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    skip_recent_unit: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    recipient_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    step_sent_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    replied_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    delivered_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_step: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_campaigns_agent_status", "agent_id", "status"),
    )


class CampaignStep(Base):
    __tablename__ = "campaign_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    delay_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    template_body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("campaign_id", "position", name="uq_campaign_step"),
    )


class CampaignRecipient(Base):
    __tablename__ = "campaign_recipients"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    fields: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    replied_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint("campaign_id", "phone", name="uq_campaign_recipient_phone"),
        Index("ix_campaign_recipients_campaign", "campaign_id"),
    )


class CampaignSend(Base):
    __tablename__ = "campaign_sends"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    recipient_id: Mapped[int] = mapped_column(
        ForeignKey("campaign_recipients.id", ondelete="CASCADE"), nullable=False
    )
    step_position: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    delivery: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    next_send_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    hold_since: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    provider_msg_id: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    http_status: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    channel_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    fail_reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    body: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint("recipient_id", "step_position", name="uq_campaign_send_step"),
        Index("ix_campaign_sends_due", "agent_id", "status", "next_send_at"),
        Index("ix_campaign_sends_msg", "provider_msg_id"),
    )


class CampaignUsage(Base):
    __tablename__ = "campaign_usage"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    model: Mapped[str] = mapped_column(String(50), nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cache_read_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cache_creation_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("campaign_id", "model", name="uq_campaign_usage_model"),
    )


class CampaignImport(Base):
    __tablename__ = "campaign_imports"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    filename: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    payload: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    phone_column: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="uploaded")
    error: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    headers: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
