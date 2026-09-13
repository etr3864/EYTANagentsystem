def normalize_phone(raw: str) -> str:
    """Same digit rules as WhatsApp outbound. Raises ValueError if unusable."""
    digits = "".join(c for c in (raw or "") if c.isdigit())
    if digits.startswith("0") and len(digits) >= 9:
        digits = "972" + digits[1:]
    elif len(digits) == 9 and digits.startswith("5"):
        digits = "972" + digits
    if len(digits) < 10 or len(digits) > 15:
        raise ValueError("מספר טלפון לא תקין")
    return digits


def storage_phone(link_id: int, normalized: str) -> str:
    """Never pass the tester's raw number to users.get_or_create."""
    return f"pg:{int(link_id)}:{normalized}"


def display_phone(normalized: str) -> str:
    """Admin label only. Never the pg: storage key."""
    digits = "".join(c for c in (normalized or "") if c.isdigit())
    if digits.startswith("972") and len(digits) >= 12:
        local = "0" + digits[3:]
        return f"{local[:3]}-{local[3:]}"
    return digits


def claimed_name(user) -> str:
    meta = user.metadata_ or {}
    return (user.name or meta.get("claimed_name") or "").strip() or "בודק"


def claimed_phone(user) -> str:
    meta = user.metadata_ or {}
    return display_phone(str(meta.get("claimed_phone") or ""))


def tester_label(user) -> str:
    phone = claimed_phone(user)
    name = claimed_name(user)
    return f"{name} · {phone}" if phone else name
