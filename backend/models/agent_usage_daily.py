"""Daily token usage aggregation per agent, model, and source.

One row per (agent_id, date, model, source) combination.
Updated atomically via UPSERT on every LLM call.
"""
from datetime import date as date_type

from sqlalchemy import Date, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base


class AgentUsageDaily(Base):
    __tablename__ = "agent_usage_daily"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    date: Mapped[date_type] = mapped_column(Date)
    model: Mapped[str] = mapped_column(String(50))
    source: Mapped[str] = mapped_column(String(30))

    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cache_read_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cache_creation_tokens: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        UniqueConstraint("agent_id", "date", "model", "source", name="uq_usage_daily"),
        Index("ix_usage_daily_agent_date", "agent_id", "date"),
    )
