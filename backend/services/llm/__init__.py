"""LLM Provider factory.

Provides unified access to different LLM providers (Anthropic, Google, OpenAI).
"""
from backend.core.config import settings
from backend.core.logger import log


# Lazy-loaded provider instances
_providers: dict = {}


def _is_openai_model(model: str) -> bool:
    """Check if model is an OpenAI model."""
    return model.startswith(("gpt-", "o1-", "o3-"))


def get_provider(model: str):
    """Get the appropriate provider for the model.
    
    Args:
        model: Model name (e.g., 'gpt-5.2-chat-latest', 'gemini-2.0-flash', 'claude-...')
    
    Returns:
        Provider instance (AnthropicProvider, GeminiProvider, or OpenAIProvider)
    
    Raises:
        ValueError: If provider is requested but not configured
    """
    if _is_openai_model(model):
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY not configured. Cannot use OpenAI models.")
        
        if "openai" not in _providers:
            from .openai_provider import OpenAIProvider
            _providers["openai"] = OpenAIProvider(settings.openai_api_key)
            log("LLM_INIT", provider="openai")
        
        return _providers["openai"]
    
    elif model.startswith("gemini"):
        if not settings.google_api_key:
            raise ValueError("GOOGLE_API_KEY not configured. Cannot use Gemini models.")
        
        if "gemini" not in _providers:
            from .gemini import GeminiProvider
            _providers["gemini"] = GeminiProvider(settings.google_api_key)
            log("LLM_INIT", provider="gemini")
        
        return _providers["gemini"]
    
    else:  # claude / default
        if "anthropic" not in _providers:
            from .anthropic import AnthropicProvider
            _providers["anthropic"] = AnthropicProvider(settings.anthropic_api_key)
            log("LLM_INIT", provider="anthropic")
        
        return _providers["anthropic"]


def is_gemini_available() -> bool:
    """Check if Gemini is configured and available."""
    return bool(settings.google_api_key)


def has_images(messages: list) -> bool:
    """Check if messages contain images.
    
    Used to force Claude for image understanding since
    Gemini image handling is not implemented.
    """
    for msg in messages:
        content = msg.get("content", [])
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "image":
                    return True
    return False
