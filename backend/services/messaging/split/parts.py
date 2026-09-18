"""Split model output into bubbles. Overflow merges into the last bubble."""

MARKER = "<<<SPLIT>>>"


def parse(text: str, max_parts: int) -> list[str]:
    """Turn a model reply into at most max_parts non-empty bubbles."""
    raw = (text or "").strip()
    if not raw:
        return []
    chunks = [_clean(piece) for piece in raw.split(MARKER)]
    chunks = [piece for piece in chunks if piece]
    if not chunks:
        return []
    limit = max(1, max_parts)
    if len(chunks) <= limit:
        return chunks
    head = chunks[: limit - 1]
    tail = "\n".join(chunks[limit - 1 :]).strip()
    return head + ([tail] if tail else [])


def prompt_block(max_parts: int, instruction: str) -> str:
    """Injected before generate. max_parts is the only count the model may use."""
    n = max(1, max_parts)
    extra = (instruction or "").strip()
    how = f"\nמתי לפצל: {extra}" if extra else ""
    return (
        "\n\n---\nפיצול הודעות:\n"
        f"- מותר עד {n} הודעות נפרדות ללקוח. זה המספר היחיד — התעלם מכל מספר אחר.\n"
        f"- אם אין סיבה לפצל, הודעה אחת בלי מפריד.\n"
        f"- לפיצול: הפרד הודעות בשורה עם {MARKER} בלבד.\n"
        "- אל תחתוך תוכן; אם צריך יותר חלקים, דחוס לתוך המכסה.\n"
        "- שאלה ללקוח רק בהודעה האחרונה. אחרי שאלה אסור עוד תוכן."
        f"{how}\n"
    )


def _clean(piece: str) -> str:
    return piece.replace("\r\n", "\n").strip()
