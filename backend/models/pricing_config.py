"""System-wide pricing configuration.

One row per key (e.g. 'model.claude-sonnet-4-6.input', 'usd_to_ils').
Used exclusively by the Super Admin dashboard for cost calculations.
"""
from datetime import datetime

from sqlalchemy import DateTime, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base

# Default values seeded on first migration
PRICING_DEFAULTS: dict[str, float] = {
    "model.claude-sonnet-4-6.input": 3.00,
    "model.claude-sonnet-4-6.output": 15.00,
    "model.claude-haiku-4-5.input": 1.00,
    "model.claude-haiku-4-5.output": 5.00,
    "model.gemini-2.0-flash.input": 0.10,
    "model.gemini-2.0-flash.output": 0.40,
    "model.gpt-5.2-chat-latest.input": 1.75,
    "model.gpt-5.2-chat-latest.output": 14.00,
    "usd_to_ils": 3.65,
}


class PricingConfig(Base):
    __tablename__ = "pricing_config"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[float] = mapped_column(Numeric(precision=18, scale=6))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
