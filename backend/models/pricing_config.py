"""System-wide pricing configuration.

One row per key (e.g. 'model.claude-sonnet-4-6.input', 'usd_to_ils').
Used exclusively by the Super Admin dashboard for cost calculations.
"""
from datetime import datetime

from sqlalchemy import DateTime, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base

# Default values seeded on first migration
PRICING_DEFAULTS: dict[str, float] = {
    # Anthropic
    "model.claude-sonnet-4-6.input": 3.00,
    "model.claude-sonnet-4-6.output": 15.00,
    "model.claude-sonnet-4-20250514.input": 3.00,
    "model.claude-sonnet-4-20250514.output": 15.00,
    "model.claude-haiku-4-5.input": 1.00,
    "model.claude-haiku-4-5.output": 5.00,
    "model.claude-opus-4-6.input": 15.00,
    "model.claude-opus-4-6.output": 75.00,
    # OpenAI
    "model.gpt-5.2-chat-latest.input": 1.75,
    "model.gpt-5.2-chat-latest.output": 14.00,
    "model.gpt-4o.input": 2.50,
    "model.gpt-4o.output": 10.00,
    "model.gpt-4.1.input": 2.00,
    "model.gpt-4.1.output": 8.00,
    # Google
    "model.gemini-2.5-flash.input": 0.15,
    "model.gemini-2.5-flash.output": 0.60,
    "model.gemini-2.5-pro.input": 1.25,
    "model.gemini-2.5-pro.output": 10.00,
    "model.gemini-2.0-flash.input": 0.10,
    "model.gemini-2.0-flash.output": 0.40,
    "model.gemini-3-flash-preview.input": 0.15,
    "model.gemini-3-flash-preview.output": 0.60,
    "model.gemini-3-pro-preview.input": 1.25,
    "model.gemini-3-pro-preview.output": 10.00,
    "usd_to_ils": 3.65,
}


class PricingConfig(Base):
    __tablename__ = "pricing_config"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[float] = mapped_column(Numeric(precision=18, scale=6))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=datetime.utcnow
    )
