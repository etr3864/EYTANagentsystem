from datetime import datetime
from typing import Optional
from sqlalchemy import Text, DateTime, ForeignKey, String, Integer, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.core.database import Base


class Message(Base):
    """Conversation message.
    
    message_type: 'text', 'voice', 'media'
    For media messages, media_id references agent_media table.
    """
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"), index=True)
    role: Mapped[str] = mapped_column(String(10))  # 'user' or 'assistant'
    content: Mapped[str] = mapped_column(Text)
    message_type: Mapped[Optional[str]] = mapped_column(String(20), default="text")
    
    # Media reference (for message_type='media')
    media_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("agent_media.id", ondelete="SET NULL"),
        nullable=True
    )
    media_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
    
    __table_args__ = (
        Index("ix_messages_conv_media", "conversation_id", "media_id"),
    )
