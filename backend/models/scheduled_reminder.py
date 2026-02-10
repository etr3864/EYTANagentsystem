"""Scheduled reminder model for appointment reminders."""
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.core.database import Base
from backend.core.enums import ReminderStatus, ReminderContentType


class ScheduledReminder(Base):
    """Scheduled reminder for an appointment.
    
    Created when an appointment is booked.
    Processed by the background scheduler when scheduled_for time arrives.
    """
    __tablename__ = "scheduled_reminders"

    id: Mapped[int] = mapped_column(primary_key=True)
    appointment_id: Mapped[int] = mapped_column(ForeignKey("appointments.id", ondelete="CASCADE"))
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id", ondelete="CASCADE"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    
    # When to send
    scheduled_for: Mapped[datetime] = mapped_column(DateTime)
    
    # Status (uses enum but stored as string for DB compatibility)
    status: Mapped[str] = mapped_column(String(20), default=ReminderStatus.PENDING)
    
    # Who to send to
    send_to_customer: Mapped[bool] = mapped_column(Boolean, default=True)
    send_to_business: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Delivery channel (kept for backwards compatibility, always WhatsApp now)
    channel: Mapped[str] = mapped_column(String(20), default="whatsapp")
    
    # Content generation type
    content_type: Mapped[str] = mapped_column(String(20), default=ReminderContentType.TEMPLATE)
    template: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Rule identifier (to track which rule created this reminder)
    rule_index: Mapped[int] = mapped_column(default=0)
    
    # Tracking
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    
    # Relationships
    appointment: Mapped["Appointment"] = relationship()
    agent: Mapped["Agent"] = relationship()
    user: Mapped["User"] = relationship()
    
    __table_args__ = (
        # Main query: find pending reminders that are due
        Index("ix_scheduled_reminders_pending", "status", "scheduled_for"),
        # Cleanup: find reminders by appointment
        Index("ix_scheduled_reminders_appointment", "appointment_id"),
    )
