from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, DateTime, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.core.database import Base


class Appointment(Base):
    """Appointment model for calendar scheduling."""
    __tablename__ = "appointments"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    
    # Google Calendar sync
    google_event_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Timing
    start_time: Mapped[datetime] = mapped_column(DateTime)
    end_time: Mapped[datetime] = mapped_column(DateTime)
    
    # Details
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Status: scheduled, cancelled, completed
    status: Mapped[str] = mapped_column(String(20), default="scheduled")
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    agent: Mapped["Agent"] = relationship(back_populates="appointments")
    user: Mapped["User"] = relationship(back_populates="appointments")
    
    __table_args__ = (
        Index("ix_appointments_agent_time", "agent_id", "start_time"),
        Index("ix_appointments_user", "user_id"),
        Index("ix_appointments_google_event", "google_event_id"),
    )
    
    @property
    def duration_minutes(self) -> int:
        """Calculate duration in minutes."""
        delta = self.end_time - self.start_time
        return int(delta.total_seconds() / 60)
