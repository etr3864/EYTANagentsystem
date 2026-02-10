from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, JSON, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.core.database import Base
import enum


class Gender(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    UNKNOWN = "unknown"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    gender: Mapped[Gender] = mapped_column(Enum(Gender), default=Gender.UNKNOWN)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    conversations: Mapped[list["Conversation"]] = relationship(back_populates="user")
    appointments: Mapped[list["Appointment"]] = relationship(back_populates="user")
