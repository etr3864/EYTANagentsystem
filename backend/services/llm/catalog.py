DEFAULT_MODEL = "claude-sonnet-5"
CHEAP_ANTHROPIC = "claude-haiku-4-5"
CHEAP_OPENAI = "gpt-5.6-luna"
CHEAP_GEMINI = "gemini-3.8-flash"

ALIASES = {
    "gpt-5.2-chat-latest": "gpt-5.6-luna",
    "gpt-5.1-chat-latest": "gpt-5.6-luna",
    "gpt-5-chat-latest": "gpt-5.6-luna",
    "gpt-4o": "gpt-5.6-luna",
    "gpt-4o-mini": "gpt-5.6-luna",
    "gpt-4.1": "gpt-5.6-terra",
    "claude-sonnet-4-20250514": "claude-sonnet-4-6",
    "claude-opus-4-6": "claude-opus-5",
    "gemini-3.1-pro-preview": "gemini-3.8-flash",
    "gemini-2.5-pro": "gemini-3.8-flash",
    "gemini-2.0-flash": "gemini-3.8-flash",
    "gemini-3.5-flash": "gemini-3.8-flash",
}

# thinking: none | adaptive | budget | gemini
CATALOG: dict[str, dict] = {
    "claude-sonnet-5": {
        "thinking": "adaptive",
        "options": ("off", "low", "medium"),
        "default": "off",
    },
    "claude-sonnet-4-6": {
        "thinking": "budget",
        "options": ("off", "low", "medium"),
        "default": "off",
    },
    "claude-haiku-4-5": {
        "thinking": "none",
        "options": (),
        "default": "off",
    },
    "claude-opus-5": {
        "thinking": "adaptive",
        "options": ("off", "low", "medium"),
        "default": "off",
    },
    "gpt-5.6-luna": {
        "thinking": "none",
        "options": (),
        "default": "off",
    },
    "gpt-5.6-terra": {
        "thinking": "none",
        "options": (),
        "default": "off",
    },
    "gemini-3.6-flash": {
        "thinking": "gemini",
        "options": ("minimal", "low", "medium"),
        "default": "low",
    },
    "gemini-3.7-flash": {
        "thinking": "gemini",
        "options": ("low", "medium"),
        "default": "low",
    },
    "gemini-3.8-flash": {
        "thinking": "gemini",
        "options": ("low", "medium"),
        "default": "low",
    },
}


def resolve_model(model: str | None) -> str:
    if not model:
        return DEFAULT_MODEL
    return ALIASES.get(model, model)


def selectable_models() -> list[dict]:
    """Same keys as the agent model dropdown. Aliases are not listed."""
    out = []
    for key, spec in CATALOG.items():
        if key.startswith("claude"):
            provider = "Anthropic"
        elif key.startswith("gpt"):
            provider = "OpenAI"
        else:
            provider = "Google"
        out.append({
            "key": key,
            "provider": provider,
            "thinking_options": list(spec["options"]),
            "default_thinking": spec["default"],
        })
    return out


def require_selectable_model(model: str | None) -> str:
    resolved = resolve_model(model)
    if resolved not in CATALOG:
        keys = ", ".join(CATALOG)
        raise ValueError(f"מודל לא נתמך. בחר מהרשימה: {keys}")
    return resolved


def conversation_model(model: str | None, has_images: bool = False) -> str:
    actual = resolve_model(model)
    if has_images and actual.startswith("gemini"):
        return DEFAULT_MODEL
    return actual


_UNKNOWN = {"thinking": "none", "options": (), "default": "off"}


def spec_for(model: str) -> dict:
    return CATALOG.get(resolve_model(model), _UNKNOWN)


_THINKING_WEIGHT = {
    "off": 0,
    "minimal": 1,
    "low": 2,
    "medium": 3,
    "high": 4,
    "max": 5,
    "xhigh": 5,
}


def sanitize_thinking(model: str, level: str | None) -> str:
    spec = spec_for(model)
    if spec["thinking"] == "none":
        return "off"
    if level in spec["options"]:
        return level
    if level in ("high", "max", "xhigh") and "medium" in spec["options"]:
        return "medium"
    return spec["default"]


def lightest_thinking(model: str) -> str:
    spec = spec_for(model)
    options = spec["options"]
    if spec["thinking"] == "none" or not options:
        return "off"
    return min(options, key=lambda option: _THINKING_WEIGHT.get(option, 99))


def degrade_thinking(model: str, current: str) -> str | None:
    """Lightest valid level if current is heavier; None if already lightest."""
    current = sanitize_thinking(model, current)
    lightest = lightest_thinking(model)
    if _THINKING_WEIGHT.get(current, 0) <= _THINKING_WEIGHT.get(lightest, 0):
        return None
    return lightest


def conversation_max_tokens(thinking_level: str) -> int:
    if thinking_level in ("high", "max", "xhigh"):
        return 16000
    if thinking_level in ("medium", "low"):
        return 8192
    return 4096


def anthropic_extra(model: str, thinking_level: str) -> dict:
    spec = spec_for(model)
    kind = spec["thinking"]
    if kind == "none":
        return {}
    if thinking_level == "off":
        return {"thinking": {"type": "disabled"}}
    if kind == "adaptive":
        return {
            "thinking": {"type": "adaptive"},
            "output_config": {"effort": thinking_level},
        }
    budgets = {"low": 1024, "medium": 4096, "high": 8000}
    return {"thinking": {"type": "enabled", "budget_tokens": budgets.get(thinking_level, 1024)}}


def apply_anthropic_thinking(kwargs: dict, model: str, level: str) -> dict:
    out = dict(kwargs)
    out.pop("thinking", None)
    out.pop("output_config", None)
    out.update(anthropic_extra(model, level))
    out["max_tokens"] = conversation_max_tokens(level)
    return out


def gemini_thinking_level(model: str, thinking_level: str) -> str | None:
    spec = spec_for(model)
    if spec["thinking"] != "gemini":
        return None
    if thinking_level in spec["options"]:
        return thinking_level
    return spec["options"][0] if spec["options"] else spec["default"]
