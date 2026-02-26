"""Safe context window limits per LLM provider (90% of actual max)."""

from backend.services.llm import _resolve_provider_name

CONTEXT_WINDOW_SAFE: dict[str, int] = {
    "anthropic": 180_000,
    "openai": 115_200,
    "google": 943_718,
}

CHARS_PER_TOKEN = 3  # Conservative estimate for Hebrew + English mix


def get_safe_context_limit(model: str) -> int:
    provider = _resolve_provider_name(model)
    return CONTEXT_WINDOW_SAFE.get(provider, 115_200)


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return len(text) // CHARS_PER_TOKEN + 1
