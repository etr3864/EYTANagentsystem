"""Scheduled follow-up model for customer re-engagement.

Created by the scheduler when a conversation meets follow-up criteria.
AI evaluates whether to send and generates content at execution time.
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.core.database import Base
from backend.core.enums import FollowupStatus


class ScheduledFollowup(Base):
    __tablename__ = "scheduled_followups"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))

    followup_number: Mapped[int] = mapped_column(default=1)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(20), default=FollowupStatus.PENDING)

    # Filled after AI evaluation
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    sent_via: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    template_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relationships
    conversation: Mapped["Conversation"] = relationship()
    agent: Mapped["Agent"] = relationship()
    user: Mapped["User"] = relationship()

    __table_args__ = (
        Index("ix_followups_pending", "status", "scheduled_for"),
        Index("ix_followups_conversation", "conversation_id"),
        Index("ix_followups_agent", "agent_id"),
    )
