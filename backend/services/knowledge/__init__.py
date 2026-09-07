"""Knowledge context builder for system prompt."""
from sqlalchemy.orm import Session


def get_context(db: Session, agent_id: int) -> str:
    """Build knowledge context showing available data sources for the AI."""
    from . import documents, tables

    docs = documents.get_by_agent(db, agent_id)
    agent_tables = tables.get_by_agent(db, agent_id)

    if not docs and not agent_tables:
        return ""

    parts = ["מקורות מידע זמינים לחיפוש:"]

    if docs:
        parts.append(
            "מסמכים — כשהנושא ברור, העבר את שם הקובץ ב-document של search_knowledge:"
        )
        for doc in docs:
            parts.append(f"• {doc.filename}")

    if agent_tables:
        for t in agent_tables:
            cols = ", ".join(t.columns.keys()) if t.columns else "ללא עמודות"
            parts.append(
                f"• טבלה '{t.name}' ({t.row_count} שורות, עמודות: {cols}) "
                "- השתמש בכלי query_products לשליפת מידע"
            )

    return "\n".join(parts)
