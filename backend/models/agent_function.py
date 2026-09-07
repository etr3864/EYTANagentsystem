from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base


class AgentFunction(Base):
    __tablename__ = "agent_functions"
    __table_args__ = (
        UniqueConstraint("agent_id", "name", name="uq_agent_functions_agent_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(64))
    when_to_use: Mapped[str] = mapped_column(Text)
    when_not_to_use: Mapped[str] = mapped_column(Text, default="")
    response_instructions: Mapped[str] = mapped_column(Text, default="")
    side_effect: Mapped[str] = mapped_column(String(16), default="read")
    trigger: Mapped[str] = mapped_column(String(24), default="conversation")
    event_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    method: Mapped[str] = mapped_column(String(8), default="GET")
    url: Mapped[str] = mapped_column(Text)
    allowed_host: Mapped[str] = mapped_column(String(255))
    headers_encrypted: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)
    body_template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    params: Mapped[list] = mapped_column(JSONB, default=list)
    outputs: Mapped[list] = mapped_column(JSONB, default=list)
    timeout_ms: Mapped[int] = mapped_column(Integer, default=8000)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    test_passed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    test_was_live: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=func.now()
    )


class AgentFunctionRun(Base):
    __tablename__ = "agent_function_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    function_id: Mapped[int] = mapped_column(
        ForeignKey("agent_functions.id", ondelete="CASCADE"), index=True
    )
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(24))
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    request_preview: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    response_preview: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class AgentFunctionIdempotency(Base):
    __tablename__ = "agent_function_idempotency"
    __table_args__ = (
        UniqueConstraint("key", name="uq_agent_function_idempotency_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(128))
    function_id: Mapped[int] = mapped_column(
        ForeignKey("agent_functions.id", ondelete="CASCADE"), index=True
    )
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), index=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[str] = mapped_column(String(24))
    outputs: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=func.now())
