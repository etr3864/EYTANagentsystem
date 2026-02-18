"""API key pool manager with round-robin selection and cooldown.

Manages multiple API keys per LLM provider (Anthropic, OpenAI, Gemini).
Supports per-agent override keys with automatic fallback to system pool.
"""
import random
import time
from typing import TYPE_CHECKING

from backend.core.config import settings
from backend.core.logger import log, log_error

if TYPE_CHECKING:
    from backend.models.agent import Agent

COOLDOWN_DEFAULT = 30
JITTER_MAX = 10


class _KeyState:
    __slots__ = ("key", "available_at", "dead")

    def __init__(self, key: str):
        self.key = key
        self.available_at: float = 0.0
        self.dead: bool = False

    @property
    def is_available(self) -> bool:
        return not self.dead and time.time() >= self.available_at


_pools: dict[str, list[_KeyState]] = {}
_counters: dict[str, int] = {}


def _init_pool(provider: str) -> list[_KeyState]:
    """Load keys from ENV. Falls back to singular key if multi-key is empty."""
    multi_raw = {
        "anthropic": settings.anthropic_api_keys,
        "openai": settings.openai_api_keys,
        "google": settings.google_api_keys,
    }.get(provider, "")

    keys = [k.strip() for k in multi_raw.split(",") if k.strip()] if multi_raw else []

    if not keys:
        singular = {
            "anthropic": settings.anthropic_api_key,
            "openai": settings.openai_api_key,
            "google": settings.google_api_key,
        }.get(provider)
        if singular:
            keys = [singular]

    return [_KeyState(k) for k in keys]


def _get_pool(provider: str) -> list[_KeyState]:
    if provider not in _pools:
        _pools[provider] = _init_pool(provider)
    return _pools[provider]


def get_key(provider: str, agent: "Agent | None" = None) -> str:
    """Get next available API key.

    Priority: agent override → round-robin from system pool.
    If all pool keys are cooling, returns the one available soonest.
    """
    if agent:
        custom = (agent.custom_api_keys or {}).get(provider)
        if custom:
            return custom

    pool = _get_pool(provider)
    if not pool:
        raise ValueError(f"No API keys configured for {provider}")

    n = len(pool)
    start = _counters.get(provider, 0) % n

    for i in range(n):
        idx = (start + i) % n
        if pool[idx].is_available:
            _counters[provider] = idx + 1
            return pool[idx].key

    best = min(
        (ks for ks in pool if not ks.dead),
        key=lambda ks: ks.available_at,
        default=None,
    )
    if best:
        return best.key

    raise ValueError(f"All API keys for {provider} are dead")


def mark_rate_limited(provider: str, key: str, retry_after: float | None = None):
    """Put a pool key on cooldown after 429."""
    cooldown = (retry_after or COOLDOWN_DEFAULT) + random.uniform(0, JITTER_MAX)
    for ks in _get_pool(provider):
        if ks.key == key:
            ks.available_at = time.time() + cooldown
            log("KEY_COOLDOWN", provider=provider, seconds=round(cooldown))
            return


def mark_dead(provider: str, key: str):
    """Permanently disable a key (auth failure). Requires restart to restore."""
    for ks in _get_pool(provider):
        if ks.key == key:
            ks.dead = True
            log_error("key_manager", f"{provider} key ...{key[-4:]} marked dead")
            return


def is_override_key(provider: str, key: str, agent: "Agent | None" = None) -> bool:
    """Check if a key is an agent-level override (not from the system pool)."""
    if not agent:
        return False
    return (agent.custom_api_keys or {}).get(provider) == key
