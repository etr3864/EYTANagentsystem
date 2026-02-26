"""Build prompts for context summary generation."""
from sqlalchemy.orm import Session

from backend.models.message import Message
from backend.models.conversation_context_summary import ConversationContextSummary

MAX_MESSAGES_FOR_FULL_SUMMARY = 200

SUMMARY_INSTRUCTIONS = """סכם את השיחה בצורה מובנית ותמציתית. הסיכום ישמש כזיכרון ארוך טווח לסוכן AI.

כלול:
1. נושאים מרכזיים שנדונו
2. מידע שנלמד על הלקוח (שם, מגדר, תחום, העדפות)
3. בקשות ותשובות מרכזיות
4. מדיה/קבצים שנשלחו (ציין סוג ותיאור)
5. פגישות שנקבעו/שונו/בוטלו
6. עניינים פתוחים שלא נסגרו
7. הסכמות או התחייבויות שניתנו

כתוב בעברית. היה ממוקד — אל תחזור על מידע כפול. אם אין מידע לסעיף מסוים, דלג עליו."""


def should_do_full_summary(incremental_count: int, full_summary_every: int) -> bool:
    if full_summary_every <= 0:
        return False
    return incremental_count > 0 and incremental_count % full_summary_every == 0


def build_summary_prompt(
    db: Session,
    conversation_id: int,
    summary: ConversationContextSummary | None,
    is_full: bool,
) -> str:
    if is_full:
        return _build_full_prompt(db, conversation_id, summary)
    return _build_incremental_prompt(db, conversation_id, summary)


def _build_incremental_prompt(
    db: Session,
    conversation_id: int,
    summary: ConversationContextSummary | None,
) -> str:
    last_id = summary.last_message_id_covered if summary else 0

    new_messages = db.query(Message).filter(
        Message.conversation_id == conversation_id,
        Message.id > last_id
    ).order_by(Message.created_at).all()

    messages_text = _format_messages(new_messages)

    parts = [SUMMARY_INSTRUCTIONS, ""]
    if summary and summary.summary_text:
        parts.append(f"סיכום קיים (עד כה):\n{summary.summary_text}")
        parts.append("")
        parts.append(f"הודעות חדשות ({len(new_messages)}):")
    else:
        parts.append(f"הודעות השיחה ({len(new_messages)}):")

    parts.append(messages_text)
    parts.append("")
    parts.append("כתוב סיכום מעודכן שמכסה את כל השיחה (כולל המידע מהסיכום הקיים אם רלוונטי):")
    return "\n".join(parts)


def _build_full_prompt(
    db: Session,
    conversation_id: int,
    summary: ConversationContextSummary | None,
) -> str:
    all_messages = db.query(Message).filter(
        Message.conversation_id == conversation_id
    ).order_by(Message.created_at).limit(MAX_MESSAGES_FOR_FULL_SUMMARY).all()

    messages_text = _format_messages(all_messages)

    parts = [
        SUMMARY_INSTRUCTIONS,
        "",
        f"כל ההודעות בשיחה ({len(all_messages)}):",
        messages_text,
        "",
        "כתוב סיכום מלא של השיחה:",
    ]
    return "\n".join(parts)


def get_last_message_id(
    db: Session, conversation_id: int
) -> int | None:
    msg = db.query(Message.id).filter(
        Message.conversation_id == conversation_id
    ).order_by(Message.created_at.desc()).first()
    return msg[0] if msg else None


def _format_messages(msgs: list[Message]) -> str:
    lines = []
    for m in msgs:
        role = "לקוח" if m.role == "user" else "סוכן"
        mtype = m.message_type or "text"
        prefix = f"[{mtype}] " if mtype != "text" else ""
        content = (m.content or "")[:500]
        lines.append(f"{role}: {prefix}{content}")
    return "\n".join(lines)
