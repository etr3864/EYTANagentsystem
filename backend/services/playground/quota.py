def would_exceed(link, upcoming: int) -> bool:
    """Call before the LLM. upcoming = estimated tokens for this turn."""
    used = int(getattr(link, "tokens_used", 0) or 0)
    limit = int(getattr(link, "token_limit", 0) or 0)
    if not limit:
        return False
    return used + max(0, int(upcoming)) > limit


def add_usage(link, amount: int) -> None:
    link.tokens_used = int(getattr(link, "tokens_used", 0) or 0) + max(0, int(amount))
