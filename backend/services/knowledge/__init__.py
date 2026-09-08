"""Knowledge context builder for system prompt."""
from sqlalchemy.orm import Session


def get_context(db: Session, agent_id: int) -> str:
    """Internal catalog for tools. Never framed as something to tell the customer."""
    from . import documents, tables

    docs = documents.get_by_agent(db, agent_id)
    agent_tables = tables.get_by_agent(db, agent_id)

    if not docs and not agent_tables:
        return ""

    parts = [
        "ידע פנימי — חפש בכלים, דבר ללקוח כאילו זה ידע שלך.",
        "אסור להזכיר ללקוח שמות מקורות או שזה מאגר, אלא אם הפרומפט למעלה ביקש במפורש.",
    ]

    if docs:
        parts.append("search_knowledge — אם ברור המקור, העבר document:")
        for doc in docs:
            parts.append(f"• {doc.filename}")

    if agent_tables:
        parts.append("query_products:")
        for t in agent_tables:
            cols = ", ".join(t.columns.keys()) if t.columns else "ללא עמודות"
            parts.append(f"• {t.name} ({t.row_count} שורות, {cols})")

    return "\n".join(parts)
