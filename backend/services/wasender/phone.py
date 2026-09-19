def session_phone(raw: str) -> str:
    """WaSender wants digits and an optional +. IL local forms become +972…"""
    digits = "".join(c for c in (raw or "") if c.isdigit())
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("0") and len(digits) >= 9:
        digits = "972" + digits[1:]
    elif len(digits) == 9 and digits.startswith("5"):
        digits = "972" + digits
    if digits.startswith("9720") and len(digits) >= 13:
        digits = "972" + digits[4:]
    if len(digits) < 10 or len(digits) > 15:
        raise ValueError("מספר לא תקין. אפשר 054, +972 או 972…")
    return f"+{digits}"
