"""Pricing configuration service.

Loads pricing from DB, calculates token costs.
All monetary values are in USD internally; convert to ILS at display time.
"""
from sqlalchemy.orm import Session

from backend.models.pricing_config import PricingConfig, PRICING_DEFAULTS
from backend.core.logger import log_error


def get_pricing(db: Session) -> dict[str, float]:
    """Load all pricing config rows. Falls back to defaults for missing keys."""
    rows = db.query(PricingConfig).all()
    result = dict(PRICING_DEFAULTS)
    for row in rows:
        result[row.key] = float(row.value)
    return result


def calc_cost_ils(
    model: str,
    input_tokens: int,
    output_tokens: int,
    pricing: dict[str, float],
) -> float:
    """Calculate cost in ILS for a given model and token counts.

    If the model has no pricing entry, cost is 0 and a warning is logged.
    """
    input_price = pricing.get(f"model.{model}.input")
    output_price = pricing.get(f"model.{model}.output")

    if input_price is None or output_price is None:
        log_error("PRICING", f"no price for model '{model}' — cost counted as 0")
        return 0.0

    usd = (input_tokens * input_price + output_tokens * output_price) / 1_000_000
    return round(usd * pricing.get("usd_to_ils", 3.65), 4)


def upsert_pricing(db: Session, updates: dict[str, float]) -> None:
    """Update or insert pricing config keys."""
    from datetime import datetime
    from sqlalchemy import text

    for key, value in updates.items():
        db.execute(
            text("""
                INSERT INTO pricing_config (key, value, updated_at)
                VALUES (:key, :value, :now)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
            """),
            {"key": key, "value": value, "now": datetime.utcnow()},
        )
