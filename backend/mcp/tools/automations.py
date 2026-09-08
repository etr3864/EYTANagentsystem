from __future__ import annotations

import copy
from typing import Any, Optional

from sqlalchemy import func

from backend.api.routers.agent_escalations import ReasonPatch
from backend.core.enums import FollowupStatus
from backend.mcp.ctx import (
    current_user,
    db_session,
    fail,
    require_agent,
    require_confirm,
    require_super,
)
from backend.models.agent_function import AgentFunctionRun
from backend.models.scheduled_followup import ScheduledFollowup
from backend.services.agent_functions import commands, present, repo, tester
from backend.services.agent_functions.egress import EgressDenied
from backend.services.agent_functions.names import FunctionNameError
from backend.services.agent_functions.present import can_enable
from backend.services.agent_functions.schemas import FunctionUpsert
from backend.services.engagement.followups import DEFAULT_CONFIG, get_config
from backend.services.entities import agents as agents_service
from backend.services.escalation import commands as escalation_commands
from backend.services.escalation import present as escalation_present
from backend.services.escalation import repo as escalation_repo
from backend.services.messaging import triggers


def register(mcp) -> None:
    _functions(mcp)
    _triggers(mcp)
    _escalations(mcp)
    _followups(mcp)


def _fn_row(agent_id: int, function_id: int, db):
    row = repo.get(db, agent_id, function_id)
    if not row:
        raise fail("פונקציה לא נמצאה")
    return row


def _clip_preview(body) -> dict | None:
    if body is None:
        return None
    if isinstance(body, dict):
        return body
    return {"text": str(body)[:2000]}


def _error_message(result: dict) -> str | None:
    err = result.get("error")
    if not err:
        return None
    if isinstance(err, dict):
        return str(err.get("message_for_model") or err.get("code") or "")[:500]
    return str(err)[:500]


def _functions(mcp) -> None:
    @mcp.tool()
    def list_functions(agent_id: int) -> list[dict]:
        """List HTTP functions on an agent. Super-admin only."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            require_agent(db, user, agent_id)
            return [present.to_public(row) for row in repo.list_for_agent(db, agent_id)]

    @mcp.tool()
    def upsert_function(agent_id: int, spec: dict[str, Any], function_id: Optional[int] = None) -> dict:
        """Create or replace an HTTP function from a spec dict. Super-admin only.
        spec fields: name, when_to_use, url, method, params, outputs, headers, body_template, side_effect, trigger."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            require_agent(db, user, agent_id)
            try:
                data = FunctionUpsert.model_validate(spec)
                if function_id is None:
                    if repo.at_capacity(db, agent_id):
                        raise fail("הגעת למקסימום פונקציות לסוכן")
                    row = commands.create_from_upsert(db, agent_id, data)
                else:
                    row = _fn_row(agent_id, function_id, db)
                    headers_provided = any(
                        v and not str(v).startswith("...") for v in (data.headers or {}).values()
                    )
                    row = commands.update_from_upsert(db, row, data, headers_provided)
            except (ValueError, FunctionNameError, EgressDenied, RuntimeError) as exc:
                raise fail(str(exc)) from exc
            return present.to_public(row)

    @mcp.tool()
    def set_function_enabled(agent_id: int, function_id: int, enabled: bool) -> dict:
        """Enable or disable a function. Enable requires a successful live test. Super-admin only."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            require_agent(db, user, agent_id)
            row = _fn_row(agent_id, function_id, db)
            if enabled and not can_enable(row):
                raise fail("צריך טסט תקין לפני הפעלה")
            row.enabled = enabled
            repo.save(db, row)
            return present.to_public(row)

    @mcp.tool()
    async def test_function(
        agent_id: int,
        function_id: int,
        live: bool = False,
        sample_values: Optional[dict[str, str]] = None,
        confirm: bool = False,
    ) -> dict:
        """Dry-run (live=false) or execute the HTTP function. Live call requires confirm=true. Super-admin only."""
        if live:
            require_confirm(confirm, "טסט חי שקורא ל-API חיצוני")
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            require_agent(db, user, agent_id)
            row = _fn_row(agent_id, function_id, db)
            result = await tester.run_test(row, sample_values or {}, live, None)
            ok = bool(result.get("ok"))
            repo.mark_test(row, live=live, ok=ok)
            repo.add_run(
                db,
                AgentFunctionRun(
                    function_id=row.id,
                    agent_id=agent_id,
                    status="ok" if ok else "error",
                    latency_ms=result.get("latency_ms") or 0,
                    request_preview=result.get("request"),
                    response_preview=_clip_preview(result.get("response")),
                    error=_error_message(result),
                ),
            )
            repo.save(db, row)
            return result

    @mcp.tool()
    def delete_function(agent_id: int, function_id: int, confirm: bool = False) -> dict:
        """Delete an HTTP function. Super-admin only. Requires confirm=true."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            require_agent(db, user, agent_id)
            require_confirm(confirm, "מחיקת פונקציה")
            row = _fn_row(agent_id, function_id, db)
            repo.delete(db, row)
            return {"status": "deleted", "id": function_id}


def _triggers(mcp) -> None:
    @mcp.tool()
    def list_triggers(agent_id: int) -> list[dict]:
        """List internal message triggers. Super-admin only."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            require_agent(db, user, agent_id)
            return [triggers.to_public(row) for row in triggers.list_for_agent(db, agent_id)]

    @mcp.tool()
    def create_trigger(agent_id: int, name: str, kind: str) -> dict:
        """Create an internal trigger. Super-admin only. kind is a trigger type the product supports."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            agent = require_agent(db, user, agent_id)
            try:
                row = triggers.create_trigger(db, agent, name, kind)
            except ValueError as exc:
                raise fail(str(exc)) from exc
            return triggers.to_public(row)

    @mcp.tool()
    def update_trigger(
        agent_id: int,
        trigger_id: int,
        enabled: Optional[bool] = None,
        name: Optional[str] = None,
    ) -> dict:
        """Enable/disable or rename a trigger. Super-admin only."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            require_agent(db, user, agent_id)
            row = triggers.get_for_agent(db, agent_id, trigger_id)
            if not row:
                raise fail("טריגר לא נמצא")
            if enabled is None and name is None:
                raise fail("אין מה לעדכן")
            try:
                return triggers.to_public(
                    triggers.update_trigger(db, row, enabled=enabled, name=name)
                )
            except ValueError as exc:
                raise fail(str(exc)) from exc

    @mcp.tool()
    def delete_trigger(agent_id: int, trigger_id: int, confirm: bool = False) -> dict:
        """Delete a trigger. Super-admin only. Requires confirm=true."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            require_agent(db, user, agent_id)
            require_confirm(confirm, "מחיקת טריגר")
            row = triggers.get_for_agent(db, agent_id, trigger_id)
            if not row:
                raise fail("טריגר לא נמצא")
            triggers.delete_trigger(db, row)
            return {"status": "deleted", "id": trigger_id}


def _escalations(mcp) -> None:
    @mcp.tool()
    def list_escalations(agent_id: int) -> list[dict]:
        """List escalation reasons. Super-admin only."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            require_agent(db, user, agent_id)
            return [
                escalation_present.to_public(row)
                for row in escalation_repo.list_for_agent(db, agent_id)
            ]

    @mcp.tool()
    def create_escalation(agent_id: int, name: str) -> dict:
        """Create an escalation reason (disabled until configured). Super-admin only."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            require_agent(db, user, agent_id)
            try:
                row = escalation_commands.create_reason(db, agent_id, name)
            except ValueError as exc:
                raise fail(str(exc)) from exc
            return escalation_present.to_public(row)

    @mcp.tool()
    def update_escalation(
        agent_id: int,
        reason_id: int,
        name: Optional[str] = None,
        enabled: Optional[bool] = None,
        when_to_use: Optional[str] = None,
        payload_hint: Optional[str] = None,
        fields: Optional[list[Any]] = None,
        phones: Optional[list[Any]] = None,
        webhook_url: Optional[str] = None,
    ) -> dict:
        """Update an escalation reason. Super-admin only."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            require_agent(db, user, agent_id)
            row = escalation_repo.get(db, agent_id, reason_id)
            if not row:
                raise fail("סיבה לא נמצאה")
            try:
                return escalation_present.to_public(
                    escalation_commands.update_reason(
                        db,
                        row,
                        ReasonPatch(
                            name=name,
                            enabled=enabled,
                            when_to_use=when_to_use,
                            payload_hint=payload_hint,
                            fields=fields,
                            phones=phones,
                            webhook_url=webhook_url,
                        ),
                    )
                )
            except ValueError as exc:
                raise fail(str(exc)) from exc

    @mcp.tool()
    def delete_escalation(agent_id: int, reason_id: int, confirm: bool = False) -> dict:
        """Delete an escalation reason. Super-admin only. Requires confirm=true."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            require_agent(db, user, agent_id)
            require_confirm(confirm, "מחיקת אסקלציה")
            row = escalation_repo.get(db, agent_id, reason_id)
            if not row:
                raise fail("סיבה לא נמצאה")
            escalation_repo.delete(db, row)
            return {"status": "deleted", "id": reason_id}


def _followups(mcp) -> None:
    @mcp.tool()
    def get_followups(agent_id: int) -> dict:
        """Follow-up sequence config and pending/sent counts."""
        with db_session() as db:
            user = current_user(db)
            require_agent(db, user, agent_id)
            agent = agents_service.get_by_id(db, agent_id)
            counts = {}
            for status in (
                FollowupStatus.PENDING,
                FollowupStatus.SENT,
                FollowupStatus.SKIPPED,
                FollowupStatus.CANCELLED,
            ):
                counts[status.value] = (
                    db.query(func.count(ScheduledFollowup.id))
                    .filter(
                        ScheduledFollowup.agent_id == agent_id,
                        ScheduledFollowup.status == status,
                    )
                    .scalar()
                )
            counts["total"] = sum(counts.values())
            return {"config": get_config(agent), "stats": counts}

    @mcp.tool()
    def update_followups(agent_id: int, config: dict[str, Any]) -> dict:
        """Update follow-up config (enabled, sequence, instructions, hours). Super-admin only."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            require_agent(db, user, agent_id)
            agent = agents_service.get_by_id(db, agent_id)
            merged = copy.deepcopy(agent.followup_config) if agent.followup_config else DEFAULT_CONFIG.copy()
            allowed = {
                "enabled",
                "model",
                "min_messages",
                "general_instruction",
                "active_hours",
                "meta_templates",
                "sequence",
            }
            unknown = set(config) - allowed
            if unknown:
                raise fail(f"שדות לא נתמכים: {', '.join(sorted(unknown))}")
            was_enabled = merged.get("enabled", False)
            merged.update(config)
            for key in [
                "ai_instructions",
                "inactivity_minutes",
                "max_followups",
                "cooldown_hours",
                "max_per_day",
                "intervals_minutes",
                "enabled_at",
            ]:
                merged.pop(key, None)
            if was_enabled and not merged.get("enabled"):
                db.query(ScheduledFollowup).filter(
                    ScheduledFollowup.agent_id == agent_id,
                    ScheduledFollowup.status.in_(
                        [FollowupStatus.PENDING, FollowupStatus.EVALUATING]
                    ),
                ).update({"status": FollowupStatus.CANCELLED}, synchronize_session="fetch")
            agents_service.update(db, agent_id, followup_config=merged)
            return merged
