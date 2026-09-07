from backend.services.agent_functions.egress import EgressDenied, assert_public_https
from backend.services.channels.wasender import normalize_phone as wasender_phone
from backend.services.escalation.constants import MAX_FIELDS, MAX_PHONES
from backend.services.escalation.keys import sanitize_key, unique_key

_MAX_LABEL = 80
_MAX_DESC = 240


def to_wasender_phone(raw: str) -> str:
    phone = wasender_phone(raw)
    if not phone:
        phone = wasender_phone("".join(c for c in raw if c.isdigit()))
    if phone.startswith("0") and 9 <= len(phone) <= 11:
        phone = "972" + phone[1:]
    if phone.startswith("9720") and len(phone) >= 13:
        phone = "972" + phone[4:]
    phone = wasender_phone(phone)
    if not phone:
        raise ValueError("מספר טלפון לא תקין. אפשר 05x, +972 או 972…")
    return phone


def normalize_phones(raw) -> list[str]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError("טלפונים חייבים להיות רשימה")
    phones = []
    seen = set()
    for item in raw:
        text = str(item or "").strip()
        if not text:
            continue
        phone = to_wasender_phone(text)
        if phone in seen:
            continue
        seen.add(phone)
        phones.append(phone)
        if len(phones) > MAX_PHONES:
            raise ValueError(f"מקסימום {MAX_PHONES} טלפונים")
    return phones


def normalize_webhook(raw: str | None) -> str | None:
    url = (raw or "").strip()
    if not url:
        return None
    try:
        assert_public_https(url)
    except EgressDenied as exc:
        raise ValueError(str(exc)) from exc
    if len(url) > 500:
        raise ValueError("כתובת webhook ארוכה מדי")
    return url


def normalize_fields(raw) -> list[dict]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        raise ValueError("שדות חייבים להיות רשימה")
    if len(raw) > MAX_FIELDS:
        raise ValueError(f"מקסימום {MAX_FIELDS} שדות")
    taken: set[str] = set()
    fields = []
    for index, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            raise ValueError("כל שדה חייב להיות אובייקט")
        key = unique_key(sanitize_key(str(item.get("key") or ""), f"field_{index}"), taken)
        label = str(item.get("label") or key).strip()[:_MAX_LABEL]
        description = str(item.get("description") or label).strip()[:_MAX_DESC]
        fields.append({
            "key": key,
            "label": label or key,
            "description": description or label or key,
            "required": bool(item.get("required", True)),
        })
    return fields


def has_destination(phones: list[str], webhook_url: str | None) -> bool:
    return bool(phones) or bool(webhook_url)


def assert_can_enable(phones: list[str], webhook_url: str | None, fields: list) -> None:
    if not has_destination(phones, webhook_url):
        raise ValueError("כדי להפעיל צריך טלפון אחד או webhook")
    if not fields:
        raise ValueError("כדי להפעיל צריך לפחות שדה אחד")
