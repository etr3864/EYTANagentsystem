"""Conversation summary model for automatic conversation summaries."""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, DateTime, Integer, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.core.database import Base
from backend.core.enums import SummaryWebhookStatus


class ConversationSummary(Base):
    """Summary of a conversation, generated automatically after inactivity.
    
    Created when:
    - X minutes pass since last customer message
    - Conversation has at least Y messages
    (X and Y are configurable per agent)
    """
    __tablename__ = "conversation_summaries"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    
    # Summary content
    summary_text: Mapped[str] = mapped_column(Text)
    message_count: Mapped[int] = mapped_column(Integer)
    
    # Timestamp of last user message when summary was created (dedup key)
    last_message_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # Webhook delivery tracking
    webhook_status: Mapped[str] = mapped_column(String(20), default=SummaryWebhookStatus.PENDING)
    webhook_attempts: Mapped[int] = mapped_column(Integer, default=0)
    webhook_last_error: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    webhook_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    next_retry_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    conversation: Mapped["Conversation"] = relationship()
    agent: Mapped["Agent"] = relationship()
    user: Mapped["User"] = relationship()
    
    __table_args__ = (
        # One summary per conversation per message window
        UniqueConstraint("conversation_id", "last_message_at", name="uq_summary_per_message_window"),
        Index("ix_summaries_pending_retry", "webhook_status", "next_retry_at"),
        Index("ix_summaries_conversation", "conversation_id"),
        Index("ix_summaries_agent", "agent_id"),
    )
