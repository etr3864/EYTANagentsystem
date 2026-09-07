from sqlalchemy.orm import Session

from backend.services.escalation.present import to_llm_tool
from backend.services.escalation.repo import list_enabled


def llm_tools(db: Session, agent_id: int) -> list[dict]:
    return [to_llm_tool(row) for row in list_enabled(db, agent_id)]
