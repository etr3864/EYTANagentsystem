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


_CACHE_READ = 0.1
_CACHE_WRITE = 1.25


def _cache_inside_input(model: str) -> bool:
    """GPT and Gemini fold cache into input. Claude reports it beside input."""
    name = model.lower()
    return name.startswith(("gpt-", "o1-", "o3-", "gemini"))


def _nonnegative(value: int) -> int:
    return max(0, int(value or 0))


def billable_input(model: str, input_tokens: int, cache_read: int = 0, cache_write: int = 0) -> float:
    raw = _nonnegative(input_tokens)
    read = _nonnegative(cache_read)
    write = _nonnegative(cache_write)
    ordinary = max(0, raw - read - write) if _cache_inside_input(model) else raw
    return ordinary + read * _CACHE_READ + write * _CACHE_WRITE


def spent_tokens(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_read: int = 0,
    cache_write: int = 0,
) -> int:
    """Every token once. Used by the playground quota, which counts tokens not shekels."""
    raw = _nonnegative(input_tokens)
    out = _nonnegative(output_tokens)
    if _cache_inside_input(model):
        return raw + out
    return raw + out + _nonnegative(cache_read) + _nonnegative(cache_write)


def calc_cost_ils(
    model: str,
    input_tokens: int,
    output_tokens: int,
    pricing: dict[str, float],
    cache_read: int = 0,
    cache_write: int = 0,
) -> float:
    """Calculate cost in ILS for a given model and token counts.

    If the model has no pricing entry, cost is 0 and a warning is logged.
    """
    from backend.services.llm.catalog import resolve_model

    input_price = pricing.get(f"model.{model}.input")
    output_price = pricing.get(f"model.{model}.output")
    priced_as = model
    if input_price is None:
        priced_as = resolve_model(model)
        input_price = pricing.get(f"model.{priced_as}.input")
        output_price = pricing.get(f"model.{priced_as}.output")

    if input_price is None or output_price is None:
        log_error("PRICING", f"no price for model '{model}' — cost counted as 0")
        return 0.0

    units = billable_input(priced_as, input_tokens, cache_read, cache_write)
    usd = (units * input_price + _nonnegative(output_tokens) * output_price) / 1_000_000
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
