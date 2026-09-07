from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base


class AgentEscalationReason(Base):
    __tablename__ = "agent_escalation_reasons"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    slug: Mapped[str] = mapped_column(String(64))
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    when_to_use: Mapped[str] = mapped_column(Text, default="")
    payload_hint: Mapped[str] = mapped_column(Text, default="")
    fields: Mapped[list] = mapped_column(JSONB, default=list)
    phones: Mapped[list] = mapped_column(JSONB, default=list)
    webhook_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("agent_id", "slug", name="uq_escalation_agent_slug"),
    )


class EscalationCooldown(Base):
    __tablename__ = "escalation_cooldowns"
    __table_args__ = (
        UniqueConstraint("conversation_id", "reason_id", name="uq_escalation_cooldown"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    reason_id: Mapped[int] = mapped_column(
        ForeignKey("agent_escalation_reasons.id", ondelete="CASCADE"), index=True
    )
    fired_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
