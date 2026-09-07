import re
import unicodedata

_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")
_NON_KEY = re.compile(r"[^a-z0-9]+")


def sanitize_key(raw: str, fallback: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", raw or "")
    ascii_text = ascii_text.encode("ascii", "ignore").decode("ascii")
    cleaned = _NON_KEY.sub("_", ascii_text.lower()).strip("_")
    if _KEY_RE.match(cleaned):
        return cleaned
    if _KEY_RE.match(fallback):
        return fallback
    return "field"


def slugify_name(name: str, fallback: str) -> str:
    return sanitize_key(name, fallback)


def unique_key(base: str, taken: set[str]) -> str:
    candidate = base
    index = 2
    while candidate in taken:
        suffix = f"_{index}"
        candidate = f"{base[: 64 - len(suffix)]}{suffix}"
        index += 1
    taken.add(candidate)
    return candidate
