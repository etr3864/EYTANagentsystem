"""Agent media model for images, videos, and documents."""
from datetime import datetime
from typing import Optional

from sqlalchemy import String, Text, Boolean, DateTime, Integer, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from backend.core.database import Base

# Embedding dimension (OpenAI text-embedding-3-small)
EMBEDDING_DIM = 1536

# File size limits (bytes)
MAX_IMAGE_SIZE = 5 * 1024 * 1024    # 5MB
MAX_VIDEO_SIZE = 16 * 1024 * 1024   # 16MB
MAX_DOCUMENT_SIZE = 25 * 1024 * 1024  # 25MB (WhatsApp allows 100MB, starting conservative)

# Allowed MIME types
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png"}
ALLOWED_VIDEO_TYPES = {"video/mp4"}
ALLOWED_DOCUMENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
}

# Extension mapping for documents (for display purposes)
DOCUMENT_EXTENSIONS = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "text/plain": "txt",
}


class AgentMedia(Base):
    """Media files (images/videos/documents) uploaded for an agent.
    
    Used by AI to send contextual media during conversations.
    Supports semantic search via embeddings.
    """
    __tablename__ = "agent_media"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(
        ForeignKey("agents.id", ondelete="CASCADE"),
        index=True
    )
    
    # Type: 'image', 'video', or 'document'
    media_type: Mapped[str] = mapped_column(String(20))
    
    # Metadata
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    default_caption: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    
    # For documents: filename shown to recipient in WhatsApp (e.g., "price_list.pdf")
    filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # File info
    file_url: Mapped[str] = mapped_column(Text)  # Public R2 URL
    file_key: Mapped[str] = mapped_column(Text)  # R2 path: agents/1/images/abc.jpg
    file_size: Mapped[int] = mapped_column(Integer)  # Size after compression
    original_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    mime_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    
    # Semantic search
    embedding: Mapped[Optional[list]] = mapped_column(Vector(EMBEDDING_DIM), nullable=True)
    
    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Relationships
    agent: Mapped["Agent"] = relationship()

    __table_args__ = (
        Index("ix_agent_media_agent_type", "agent_id", "media_type"),
        Index("ix_agent_media_agent_active", "agent_id", "is_active"),
    )
    
    @property
    def size_kb(self) -> float:
        """File size in KB."""
        return round(self.file_size / 1024, 1)
    
    @property
    def compression_ratio(self) -> float | None:
        """Compression ratio (original/compressed). None if not compressed."""
        if self.original_size and self.original_size > self.file_size:
            return round(self.original_size / self.file_size, 2)
        return None
