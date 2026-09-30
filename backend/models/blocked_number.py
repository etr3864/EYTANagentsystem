from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base


class BlockedNumber(Base):
    __tablename__ = "blocked_numbers"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    manual: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    opted_out: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    quote: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    opted_out_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint("agent_id", "phone", name="uq_blocked_agent_phone"),
    )
