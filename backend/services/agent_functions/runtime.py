from sqlalchemy.orm import Session

from backend.services.agent_functions import executor, repo, tool_adapter
from backend.services.agent_functions.budget import TurnBudget


class ConversationRuntime:
    def __init__(self, agent_id: int, user_id: int, conversation_id: int):
        self.agent_id = agent_id
        self.user_id = user_id
        self.conversation_id = conversation_id
        self.budget = TurnBudget()

    def llm_tools(self, db: Session) -> list[dict]:
        rows = repo.list_enabled_conversation(db, self.agent_id)
        return [tool_adapter.to_llm_tool(row) for row in rows]

    async def execute(self, name: str, args: dict) -> str:
        return await executor.run(
            self.agent_id,
            self.user_id,
            self.conversation_id,
            name,
            args or {},
            self.budget,
        )
