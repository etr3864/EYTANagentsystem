import re

from backend.core.ai_config import USER_TOOLS

_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
RESERVED_NAMES = {tool["name"] for tool in USER_TOOLS}


class FunctionNameError(ValueError):
    pass


def validate_name(name: str) -> str:
    cleaned = (name or "").strip()
    if not _NAME_RE.match(cleaned):
        raise FunctionNameError("שם חייב להיות באנגלית: אות קטנה ואז אותיות, ספרות או _")
    if cleaned in RESERVED_NAMES:
        raise FunctionNameError(f"השם {cleaned} שמור לכלי מערכת")
    if cleaned.startswith("esc_"):
        raise FunctionNameError("הקידומת esc_ שמורה לאסקלציה")
    return cleaned
