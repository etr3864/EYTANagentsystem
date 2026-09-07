"""Shared retrieval defaults for document and table search."""

MAX_COSINE_DISTANCE = 0.50
DEFAULT_SEARCH_LIMIT = 5
MAX_CHUNKS_PER_DOCUMENT = 2
CANDIDATE_MULTIPLIER = 4


def escape_like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def like_contains(text: str) -> str:
    return f"%{escape_like(text.strip())}%"


def match_by_name(names: list[str], hint: str) -> list[str]:
    """Resolve a model-supplied name to stored names. Exact, then contains."""
    hint = hint.strip().lower()
    if not hint:
        return names

    exact = [n for n in names if n.lower() == hint]
    if exact:
        return exact

    contains = [n for n in names if hint in n.lower()]
    if contains:
        return contains

    return [n for n in names if hint in n.rsplit(".", 1)[0].lower()]


def cap_per_key(items: list[dict], key: str, cap: int, limit: int) -> list[dict]:
    counts: dict[str, int] = {}
    picked: list[dict] = []
    for item in items:
        group = item[key]
        used = counts.get(group, 0)
        if used >= cap:
            continue
        counts[group] = used + 1
        picked.append(item)
        if len(picked) >= limit:
            break
    return picked
