"""Capacity errors and thinking degradation — shared across LLM providers."""
from backend.core.logger import log_warn
from backend.services.llm.catalog import degrade_thinking, sanitize_thinking

_CAPACITY_CODES = (429, 503, 529)
_CAPACITY_MARKERS = (
    "429",
    "503",
    "529",
    "RESOURCE_EXHAUSTED",
    "UNAVAILABLE",
    "high demand",
    "overloaded",
)


def is_capacity_error(exc: Exception) -> bool:
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    if code in _CAPACITY_CODES:
        return True
    text = str(exc)
    return any(marker.lower() in text.lower() for marker in _CAPACITY_MARKERS)


class ThinkingDowngrade:
    """Drop to the model's lightest thinking once, then stay there for the turn."""

    def __init__(self, model: str, level: str | None):
        self.model = model
        self.level = sanitize_thinking(model, level)

    def once(self, kwargs: dict, apply) -> dict | None:
        lighter = degrade_thinking(self.model, self.level)
        if not lighter:
            return None
        log_warn(f"{self.model} thinking {self.level}->{lighter}")
        self.level = lighter
        return apply(kwargs, lighter)
