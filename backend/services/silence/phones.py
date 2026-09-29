"""One phone form for blocklist and address-book lookups.

Inbound Wasender numbers already look like 972… . Uploads often look like 054….
Both have to hit the same row, or a listed person still gets an answer.
"""


def canonical(raw: str) -> str:
    text = str(raw or "").split("@", 1)[0]
    digits = "".join(ch for ch in text if ch.isdigit())
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("0") and len(digits) >= 9:
        digits = "972" + digits[1:]
    elif len(digits) == 9 and digits.startswith("5"):
        digits = "972" + digits
    if digits.startswith("9720") and len(digits) > 12:
        digits = "972" + digits[4:]
    if not 10 <= len(digits) <= 15:
        return ""
    return digits
