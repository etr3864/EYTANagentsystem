"""Knowledge context builder for system prompt."""
from sqlalchemy.orm import Session
from sqlalchemy import select

from backend.models.knowledge import Document, DataTable


def get_context(db: Session, agent_id: int) -> str:
    """Build knowledge context showing available data sources for the AI."""
    docs = list(db.scalars(
        select(Document).where(Document.agent_id == agent_id)
    ))
    tables = list(db.scalars(
        select(DataTable).where(DataTable.agent_id == agent_id)
    ))
    
    if not docs and not tables:
        return ""
    
    parts = ["מקורות מידע זמינים לחיפוש:"]
    
    if docs:
        doc_names = [d.filename for d in docs]
        parts.append(f"• מסמכים ({len(docs)}): {', '.join(doc_names)} - השתמש בכלי search_knowledge לחפש בהם")
    
    if tables:
        for t in tables:
            cols = ", ".join(t.columns.keys()) if t.columns else "ללא עמודות"
            parts.append(f"• טבלה '{t.name}' ({t.row_count} שורות, עמודות: {cols}) - השתמש בכלי query_products לשליפת מידע")
    
    return "\n".join(parts)
