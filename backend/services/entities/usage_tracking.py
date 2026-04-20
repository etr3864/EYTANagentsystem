"""Centralized daily token usage recording.

Single UPSERT function used by all LLM call sites.
"""
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.core.logger import log_error


def record_usage(
    db: Session,
    agent_id: int,
    model: str,
    source: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_creation_tokens: int = 0,
) -> None:
    """Atomically add token usage to the daily aggregate row.

    Creates the row if it doesn't exist, otherwise increments counters.
    Safe for concurrent calls — PostgreSQL row-level lock on UPDATE.
    """
    if input_tokens == 0 and output_tokens == 0:
        return

    try:
        db.execute(
            text("""
                INSERT INTO agent_usage_daily
                    (agent_id, date, model, source, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens)
                VALUES
                    (:agent_id, :date, :model, :source, :input_tokens, :output_tokens, :cache_read, :cache_create)
                ON CONFLICT (agent_id, date, model, source) DO UPDATE SET
                    input_tokens = agent_usage_daily.input_tokens + EXCLUDED.input_tokens,
                    output_tokens = agent_usage_daily.output_tokens + EXCLUDED.output_tokens,
                    cache_read_tokens = agent_usage_daily.cache_read_tokens + EXCLUDED.cache_read_tokens,
                    cache_creation_tokens = agent_usage_daily.cache_creation_tokens + EXCLUDED.cache_creation_tokens
            """),
            {
                "agent_id": agent_id,
                "date": date.today(),
                "model": model,
                "source": source,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cache_read": cache_read_tokens,
                "cache_create": cache_creation_tokens,
            },
        )
    except Exception as e:
        log_error("USAGE_TRACKING", f"record failed: {str(e)[:80]}")
