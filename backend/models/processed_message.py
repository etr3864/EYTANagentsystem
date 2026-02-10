"""Processed messages tracking for deduplication."""
from datetime import datetime
from sqlalchemy import String, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column
from backend.core.database import Base


class ProcessedMessage(Base):
    """Track processed message IDs to prevent duplicate processing."""
    __tablename__ = "processed_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    message_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    processed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Index for cleanup queries
    __table_args__ = (
        Index('ix_processed_messages_processed_at', 'processed_at'),
    )
