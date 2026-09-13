from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.database import Base


class PlaygroundLink(Base):
    __tablename__ = "playground_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("agents.id", ondelete="SET NULL"), nullable=True, index=True
    )
    agent_name_snapshot: Mapped[str] = mapped_column(String(100))
    created_by: Mapped[int] = mapped_column(
        ForeignKey("auth_users.id", ondelete="RESTRICT")
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    token_encrypted: Mapped[bytes] = mapped_column(LargeBinary)
    ttl_seconds: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    stopped_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    require_profile: Mapped[bool] = mapped_column(Boolean, default=True)
    token_limit: Mapped[int] = mapped_column(Integer, default=1_000_000)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    agent: Mapped[Optional["Agent"]] = relationship()
