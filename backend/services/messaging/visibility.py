from backend.services.escalation.constants import HIDDEN_FROM_LLM


def visible_to_llm(message_type: str | None) -> bool:
    return (message_type or "text") not in HIDDEN_FROM_LLM


def filter_history_for_llm(history: list[dict]) -> list[dict]:
    return [item for item in history if visible_to_llm(item.get("message_type"))]
