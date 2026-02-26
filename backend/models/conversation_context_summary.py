"""Context summary for long conversation memory.

Stores a rolling summary of the conversation that replaces raw message history
when the conversation exceeds the configured thresholds.
Separate from ConversationSummary (webhook-based summaries).
"""
from datetime import datetime
from sqlalchemy import Text, DateTime, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.core.database import Base


class ConversationContextSummary(Base):
    __tablename__ = "conversation_context_summaries"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"),
        unique=True, index=True
    )
    summary_text: Mapped[str] = mapped_column(Text)
    last_message_id_covered: Mapped[int] = mapped_column(Integer)
    incremental_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    conversation: Mapped["Conversation"] = relationship()
