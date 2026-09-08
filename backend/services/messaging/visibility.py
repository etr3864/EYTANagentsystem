from backend.services.escalation.constants import HIDDEN_FROM_LLM as _ESC_HIDDEN
from backend.services.messaging.replies import format_reply_for_llm

HIDDEN_FROM_LLM = _ESC_HIDDEN | {"function"}
_LLM_STRIP = ("media_url", "media_too_large", "reply_to_text")


def visible_to_llm(message_type: str | None) -> bool:
    return (message_type or "text") not in HIDDEN_FROM_LLM


def filter_history_for_llm(history: list[dict]) -> list[dict]:
    out = []
    for item in history:
        if not visible_to_llm(item.get("message_type")):
            continue
        row = {k: v for k, v in item.items() if k not in _LLM_STRIP}
        if item.get("role") == "user":
            row["content"] = format_reply_for_llm(item.get("content") or "", item.get("reply_to_text"))
        out.append(row)
    return out
