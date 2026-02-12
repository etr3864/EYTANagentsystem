"""WhatsApp message template model."""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, DateTime, JSON, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column
from backend.core.database import Base


class WhatsAppTemplate(Base):
    __tablename__ = "whatsapp_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    meta_template_id: Mapped[str] = mapped_column(String(50), index=True)
    name: Mapped[str] = mapped_column(String(512))
    language: Mapped[str] = mapped_column(String(10))
    category: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    reject_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    components: Mapped[dict] = mapped_column(JSON, default=list)
    header_media_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index("ix_template_agent_name", "agent_id", "name", "language", unique=True),
    )
