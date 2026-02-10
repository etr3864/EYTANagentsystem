"""Knowledge Base models for RAG and structured data."""
from datetime import datetime
from typing import Optional
from sqlalchemy import ForeignKey, String, Text, Boolean, DateTime, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from backend.core.database import Base

EMBEDDING_DIM = 1536  # OpenAI text-embedding-3-small


class Document(Base):
    """Uploaded documents - PDF, DOCX. Searched via RAG."""
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    
    filename: Mapped[str] = mapped_column(String(255))
    file_type: Mapped[str] = mapped_column(String(20))  # pdf, docx
    file_size: Mapped[int] = mapped_column(default=0)
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    chunk_count: Mapped[int] = mapped_column(default=0)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    chunks: Mapped[list["DocumentChunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_documents_agent", "agent_id"),
    )


class DocumentChunk(Base):
    """Document chunks with embeddings for semantic search."""
    __tablename__ = "document_chunks"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"))
    
    content: Mapped[str] = mapped_column(Text)
    chunk_index: Mapped[int] = mapped_column(default=0)
    embedding: Mapped[Optional[list]] = mapped_column(Vector(EMBEDDING_DIM), nullable=True)

    document: Mapped["Document"] = relationship(back_populates="chunks")


class DataTable(Base):
    """Structured data tables from CSV."""
    __tablename__ = "data_tables"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    columns: Mapped[dict] = mapped_column(JSON)  # {col_name: col_type}
    row_count: Mapped[int] = mapped_column(default=0)
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    rows: Mapped[list["DataRow"]] = relationship(
        back_populates="table", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_data_tables_agent", "agent_id"),
    )


class DataRow(Base):
    """Individual rows in data tables."""
    __tablename__ = "data_rows"

    id: Mapped[int] = mapped_column(primary_key=True)
    table_id: Mapped[int] = mapped_column(ForeignKey("data_tables.id", ondelete="CASCADE"))
    
    data: Mapped[dict] = mapped_column(JSON)
    embedding: Mapped[Optional[list]] = mapped_column(Vector(EMBEDDING_DIM), nullable=True)

    table: Mapped["DataTable"] = relationship(back_populates="rows")
