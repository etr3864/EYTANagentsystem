from __future__ import annotations

from typing import Any, Optional

from backend.auth import service as auth_service
from backend.mcp.ctx import (
    agent_summary,
    current_user,
    db_session,
    fail,
    public_agent,
    require_agent,
    require_confirm,
    require_super,
)
from backend.services.entities import agents as agents_service
from backend.services.knowledge import documents
from backend.services.llm.catalog import require_selectable_model, sanitize_thinking, selectable_models


def register(mcp) -> None:
    @mcp.tool()
    def whoami() -> dict:
        """Current Optive user, role, and what this token can do."""
        with db_session() as db:
            user = current_user(db)
            role = user.role.value
            return {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "role": role,
                "can_create_agents": role == "super_admin",
                "can_edit_agent_config": role == "super_admin",
                "can_manage_clients": role == "super_admin",
                "can_manage_employees": role in ("super_admin", "admin"),
                "can_manage_conversations": True,
                "can_read_costs": role == "super_admin",
            }

    @mcp.tool()
    def list_agents() -> list[dict]:
        """List agents this user can access (id, name, model, active)."""
        with db_session() as db:
            user = current_user(db)
            return [agent_summary(a) for a in auth_service.get_accessible_agents(db, user)]

    @mcp.tool()
    def get_agent(agent_id: int) -> dict:
        """Full agent config including system prompt. Secrets are omitted."""
        with db_session() as db:
            user = current_user(db)
            return public_agent(require_agent(db, user, agent_id))

    @mcp.tool()
    def list_models() -> list[dict]:
        """Selectable agent models — same keys as the UI dropdown. Pass key as model on create/update."""
        return selectable_models()

    @mcp.tool()
    def create_agent(
        name: str,
        system_prompt: str,
        model: str = "claude-sonnet-5",
        thinking_level: str = "off",
    ) -> dict:
        """Create an agent. Super-admin only. model must be a key from list_models. Channel/OAuth is a separate step."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            if not name.strip() or not system_prompt.strip():
                raise fail("name ו-system_prompt חובה")
            try:
                resolved = require_selectable_model(model)
            except ValueError as exc:
                raise fail(str(exc)) from exc
            agent = agents_service.create(
                db=db,
                name=name.strip(),
                phone_number_id="",
                access_token="",
                verify_token="",
                system_prompt=system_prompt.strip(),
                model=resolved,
                thinking_level=sanitize_thinking(resolved, thinking_level),
            )
            return {"id": agent.id, "name": agent.name, "model": agent.model}

    @mcp.tool()
    def update_agent(
        agent_id: int,
        name: Optional[str] = None,
        system_prompt: Optional[str] = None,
        appointment_prompt: Optional[str] = None,
        model: Optional[str] = None,
        thinking_level: Optional[str] = None,
        is_active: Optional[bool] = None,
        max_tool_rounds: Optional[int] = None,
        business_assistant_mode: Optional[bool] = None,
        batching_config: Optional[dict[str, Any]] = None,
        media_config: Optional[dict[str, Any]] = None,
        context_summary_config: Optional[dict[str, Any]] = None,
    ) -> dict:
        """Update agent prompt and settings. Super-admin only. model must be a key from list_models. Does not change channel secrets. context_summary_config is long-chat memory, not webhook summaries — use update_summaries for those."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            existing = require_agent(db, user, agent_id)
            updates: dict[str, Any] = {}
            if name is not None:
                updates["name"] = name.strip()
            if system_prompt is not None:
                updates["system_prompt"] = system_prompt
            if appointment_prompt is not None:
                updates["appointment_prompt"] = appointment_prompt
            if is_active is not None:
                updates["is_active"] = is_active
            if business_assistant_mode is not None:
                updates["business_assistant_mode"] = business_assistant_mode
            if batching_config is not None:
                updates["batching_config"] = batching_config
            if media_config is not None:
                updates["media_config"] = media_config
            if context_summary_config is not None:
                updates["context_summary_config"] = context_summary_config
            if max_tool_rounds is not None:
                updates["max_tool_rounds"] = max(1, min(8, int(max_tool_rounds)))
            if model is not None:
                try:
                    updates["model"] = require_selectable_model(model)
                except ValueError as exc:
                    raise fail(str(exc)) from exc
            if model is not None or thinking_level is not None:
                next_model = updates.get("model", existing.model)
                next_thinking = (
                    thinking_level
                    if thinking_level is not None
                    else getattr(existing, "thinking_level", None)
                )
                updates["thinking_level"] = sanitize_thinking(next_model, next_thinking)
            if not updates:
                raise fail("אין מה לעדכן")
            try:
                agent = agents_service.update(db, agent_id, **updates)
            except ValueError as exc:
                raise fail(str(exc)) from exc
            if not agent:
                raise fail("סוכן לא נמצא")
            return {
                "id": agent.id,
                "name": agent.name,
                "model": agent.model,
                "thinking_level": agent.thinking_level,
            }

    @mcp.tool()
    def delete_agent(agent_id: int, confirm: bool = False) -> dict:
        """Delete an agent and its data. Super-admin only. Requires confirm=true."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            require_confirm(confirm, "מחיקת סוכן")
            require_agent(db, user, agent_id)
            if not agents_service.delete(db, agent_id):
                raise fail("סוכן לא נמצא")
            return {"status": "deleted", "id": agent_id}

    @mcp.tool()
    def list_knowledge_documents(agent_id: int) -> list[dict]:
        """List knowledge documents for an agent (no full text)."""
        with db_session() as db:
            user = current_user(db)
            require_agent(db, user, agent_id)
            return [documents.to_list_item(doc) for doc in documents.get_by_agent(db, agent_id)]

    @mcp.tool()
    def get_knowledge_document(agent_id: int, document_id: int) -> dict:
        """Get a knowledge document including source text."""
        with db_session() as db:
            user = current_user(db)
            require_agent(db, user, agent_id)
            doc = documents.get_for_agent(db, agent_id, document_id)
            if not doc:
                raise fail("מסמך לא נמצא")
            return documents.to_detail(doc)

    @mcp.tool()
    def add_knowledge_text(agent_id: int, title: str, content: str) -> dict:
        """Add a text knowledge document and embed it. Super-admin only."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            require_agent(db, user, agent_id)
            try:
                doc = documents.create_from_text(db, agent_id, title, content)
            except ValueError as exc:
                raise fail(str(exc)) from exc
            return documents.to_list_item(doc)

    @mcp.tool()
    def update_knowledge_text(
        agent_id: int,
        document_id: int,
        title: Optional[str] = None,
        content: Optional[str] = None,
    ) -> dict:
        """Update a text knowledge document. Super-admin only. File uploads cannot be edited here."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            require_agent(db, user, agent_id)
            try:
                doc = documents.update(db, agent_id, document_id, title, content)
            except ValueError as exc:
                raise fail(str(exc)) from exc
            if not doc:
                raise fail("מסמך לא נמצא")
            return documents.to_detail(doc)

    @mcp.tool()
    def delete_knowledge_document(agent_id: int, document_id: int, confirm: bool = False) -> dict:
        """Delete a knowledge document. Requires confirm=true."""
        with db_session() as db:
            user = current_user(db)
            require_agent(db, user, agent_id)
            require_confirm(confirm, "מחיקת מסמך ידע")
            if not documents.delete(db, agent_id, document_id):
                raise fail("מסמך לא נמצא")
            return {"status": "deleted", "id": document_id}

    @mcp.tool()
    def search_knowledge(agent_id: int, query: str, limit: int = 5) -> list[dict]:
        """Search the agent's knowledge base the same way the bot does."""
        with db_session() as db:
            user = current_user(db)
            require_agent(db, user, agent_id)
            capped = max(1, min(20, int(limit)))
            return documents.search(db, agent_id, query, capped)
