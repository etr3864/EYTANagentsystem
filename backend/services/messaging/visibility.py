from backend.services.escalation.constants import HIDDEN_FROM_LLM as _ESC_HIDDEN
from backend.services.messaging.replies import format_reply_for_llm

HIDDEN_FROM_LLM = _ESC_HIDDEN | {"function"}
_LLM_STRIP = ("media_url", "media_too_large", "reply_to_text")


def visible_to_llm(message_type: str | None) -> bool:
    return (message_type or "text") not in HIDDEN_FROM_LLM


def speaker_label(role: str | None) -> str:
    if role == "user":
        return "לקוח"
    if role == "owner":
        return "בעל העסק"
    return "סוכן"


def filter_history_for_llm(history: list[dict]) -> list[dict]:
    out = []
    for item in history:
        if not visible_to_llm(item.get("message_type")):
            continue
        if item.get("role") == "owner":
            _fold_owner(out, item.get("content") or "")
            continue
        row = {k: v for k, v in item.items() if k not in _LLM_STRIP}
        if item.get("role") == "user":
            row["content"] = format_reply_for_llm(item.get("content") or "", item.get("reply_to_text"))
        out.append(row)
    return out


def _fold_owner(out: list[dict], content: str) -> None:
    """Owner lines are not a legal model role, and must not look like the bot."""
    line = f"[בעל העסק]: {content}"
    if out and out[-1].get("role") == "user":
        previous = out[-1].get("content") or ""
        out[-1]["content"] = f"{previous}\n{line}" if previous else line
        return
    out.append({"role": "user", "content": line})
