"""LLM Provider factory.

Provides unified access to different LLM providers (Anthropic, Google, OpenAI).
Uses key_manager for multi-key pool and per-agent override support.
"""
from typing import TYPE_CHECKING

from backend.core.logger import log
from . import key_manager

if TYPE_CHECKING:
    from backend.models.agent import Agent

# Cached provider instances keyed by "provider_name:key_prefix"
_providers: dict = {}


def _resolve_provider_name(model: str) -> str:
    if model.startswith(("gpt-", "o1-", "o3-")):
        return "openai"
    if model.startswith("gemini"):
        return "google"
    return "anthropic"


def get_provider(model: str, agent: "Agent | None" = None):
    """Get the appropriate provider for the model.

    Selects API key via key_manager (agent override or system pool).
    Caches provider instances per key to reuse HTTP connections.
    """
    provider_name = _resolve_provider_name(model)
    api_key = key_manager.get_key(provider_name, agent)
    cache_key = f"{provider_name}:{api_key[:12]}"

    if cache_key not in _providers:
        if provider_name == "openai":
            from .openai_provider import OpenAIProvider
            _providers[cache_key] = OpenAIProvider(api_key, provider_name, agent)
        elif provider_name == "google":
            from .gemini import GeminiProvider
            _providers[cache_key] = GeminiProvider(api_key, provider_name, agent)
        else:
            from .anthropic import AnthropicProvider
            _providers[cache_key] = AnthropicProvider(api_key, provider_name, agent)
        log("LLM_INIT", provider=provider_name)
    else:
        # Update agent ref — same key may serve different agents
        _providers[cache_key]._agent = agent

    return _providers[cache_key]


def is_gemini_available() -> bool:
    """Check if Gemini is configured and available."""
    from backend.core.config import settings
    return bool(settings.google_api_key or settings.google_api_keys)


def has_images(messages: list) -> bool:
    """Check if messages contain images."""
    for msg in messages:
        content = msg.get("content", [])
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "image":
                    return True
    return False
