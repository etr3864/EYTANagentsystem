import json
import re

from backend.models.agent import Agent
from backend.services.escalation.constants import MAX_FIELDS
from backend.services.escalation.validate import normalize_fields
from backend.services.llm import get_provider
from backend.services.llm.catalog import CHEAP_ANTHROPIC

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)

_PROMPT = """הפק רשימת שדות JSON לשליחה למערכת חיצונית.
החזר רק מערך JSON, בלי טקסט מסביב.
כל פריט: key (אנגלית snake_case), label (עברית קצרה), description (עברית — מה הסוכן צריך לאסוף), required (boolean).
מקסימום {max_fields} שדות. רק מה שכתוב בהנחיה, בלי שדות מיותרים.

הנחיה:
{hint}
"""


def _parse_array(text: str) -> list:
    cleaned = _FENCE.sub("", (text or "").strip()).strip()
    data = json.loads(cleaned)
    if isinstance(data, dict):
        data = data.get("fields") or data.get("properties")
    if not isinstance(data, list):
        raise ValueError("המודל לא החזיר רשימת שדות")
    return data


async def generate_fields(agent: Agent, hint: str) -> list[dict]:
    text = (hint or "").strip()
    if not text:
        raise ValueError("כתוב מה לשלוח לפני הפקת שדות")
    provider = get_provider(CHEAP_ANTHROPIC, agent=agent)
    raw = await provider.generate_simple_response(
        _PROMPT.format(max_fields=MAX_FIELDS, hint=text),
        model=CHEAP_ANTHROPIC,
        max_tokens=600,
    )
    try:
        return normalize_fields(_parse_array(raw))
    except (json.JSONDecodeError, ValueError) as exc:
        raise ValueError("הפקת השדות נכשלה. נסה שוב או הוסף ידנית.") from exc
