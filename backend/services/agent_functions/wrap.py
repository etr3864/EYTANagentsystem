import json
from typing import Any

from backend.services.agent_functions.constants import UNTRUSTED_PREFIX


def success(mapped: dict[str, Any], instructions: str = "") -> str:
    payload = _strip(json.dumps(mapped, ensure_ascii=False, default=str))
    parts = [UNTRUSTED_PREFIX, payload]
    if instructions:
        parts.append("איך לענות: " + _strip(instructions))
    return "\n".join(parts)


def error(contract: dict[str, Any]) -> str:
    return json.dumps(contract, ensure_ascii=False)


def _strip(text: str) -> str:
    return "".join(ch for ch in text if ch in "\n\t" or ord(ch) >= 32)
