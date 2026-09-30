"""Link check for campaign copy and later replies in that chat."""
import re

_SHORTENERS = (
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "cutt.ly",
    "is.gd",
    "rb.gy",
    "shorturl.at",
    "tiny.cc",
)
_URL = re.compile(
    r"""(?ix)
    (?:https?://|hxxps?://)[^\s<>"']+
    | www\.[^\s<>"']+
    | (?:bit\.ly|tinyurl\.com|t\.co|cutt\.ly|is\.gd|rb\.gy|shorturl\.at|tiny\.cc)/[^\s<>"']+
    | (?<!@)\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:/[^\s<>"']*)?
    """
)
_OBFUSCATED = re.compile(r"(?i)\b[\w-]+(?:\[\s*\.\s*\][\w-]+)+")
_FALLBACK = "אעדכן אותך בפרטים."


def find_links(text: str) -> list[str]:
    found = _URL.findall(text or "")
    found.extend(_OBFUSCATED.findall(text or ""))
    return found


def allowed_corpus(*parts: str | None) -> str:
    return "\n".join(part for part in parts if part)


def hidden_links(text: str, corpus: str) -> list[str]:
    haystack = (corpus or "").lower()
    blocked: list[str] = []
    for link in find_links(text):
        token = link.lower().rstrip(".,);]")
        host = token.split("://", 1)[-1].split("/", 1)[0]
        if token in haystack or host in haystack:
            continue
        if any(short in host for short in _SHORTENERS) and host not in haystack:
            blocked.append(link)
            continue
        blocked.append(link)
    return blocked


def sanitize(text: str, corpus: str) -> str:
    cleaned = text or ""
    for link in hidden_links(cleaned, corpus):
        cleaned = cleaned.replace(link, "")
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned).strip()
    return cleaned or _FALLBACK


def for_turn(text: str, conversation, agent) -> str:
    context = getattr(conversation, "injected_context", None) or {}
    campaign = context.get("campaign") if isinstance(context, dict) else None
    if not isinstance(campaign, dict):
        return text
    corpus = allowed_corpus(
        campaign.get("prompt"),
        campaign.get("template"),
        getattr(agent, "system_prompt", None),
    )
    if not hidden_links(text, corpus):
        return text
    return sanitize(text, corpus)
