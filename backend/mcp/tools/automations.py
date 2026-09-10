from __future__ import annotations

import copy
from datetime import datetime
from typing import Any, Literal, Optional

from sqlalchemy import func

from backend.api.routers.agent_escalations import ReasonPatch
from backend.core.enums import FollowupStatus, SummaryWebhookStatus
from backend.mcp.ctx import (
    current_user,
    db_session,
    fail,
    require_agent,
    require_confirm,
    require_super,
)
from backend.models.agent_function import AgentFunctionRun
from backend.models.conversation_summary import ConversationSummary
from backend.models.scheduled_followup import ScheduledFollowup
from backend.models.user import User
from backend.services.agent_functions import commands, present, repo, tester
from backend.services.agent_functions.egress import EgressDenied
from backend.services.agent_functions.names import FunctionNameError
from backend.services.agent_functions.present import can_enable
from backend.services.agent_functions.schemas import FunctionUpsert
from backend.services.engagement.followups import DEFAULT_CONFIG, get_config
from backend.services.engagement.summaries import (
    apply_summary_updates,
    get_summary_config,
    send_test_webhook,
)
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
    _summaries(mcp)


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
        """List HTTP webhook triggers on an agent (kinds: push, send). Super-admin only.

        push = inject facts into agent memory for a phone, optional WaSender text.
        send = WaSender text only; agent does not learn new facts.
        These are not keyword auto-replies.
        """
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            require_agent(db, user, agent_id)
            return [triggers.to_public(row) for row in triggers.list_for_agent(db, agent_id)]

    @mcp.tool()
    def create_trigger(
        agent_id: int,
        name: str,
        kind: Literal["push", "send"],
    ) -> dict:
        """Create an HTTP webhook trigger. Super-admin only.

        kind must be exactly one of:
        - push: store data on the customer so the agent knows it; optional WaSender text.
        - send: WaSender text only. The agent does not get new facts.

        Not a keyword/auto-reply. Only push and send exist.
        """
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


def _summary_webhook_stats(db, agent_id: int) -> dict:
    counts = {}
    for status in (
        SummaryWebhookStatus.PENDING,
        SummaryWebhookStatus.SENT,
        SummaryWebhookStatus.FAILED,
    ):
        counts[status.value] = (
            db.query(func.count(ConversationSummary.id))
            .filter(
                ConversationSummary.agent_id == agent_id,
                ConversationSummary.webhook_status == status,
            )
            .scalar()
        ) or 0
    counts["total"] = sum(counts.values())
    return counts


def _summaries(mcp) -> None:
    @mcp.tool()
    def get_summaries(agent_id: int) -> dict:
        """Webhook conversation-summary config (Summaries tab) and delivery counts. Not context_summary_config."""
        with db_session() as db:
            user = current_user(db)
            agent = require_agent(db, user, agent_id)
            return {
                "config": get_summary_config(agent),
                "stats": _summary_webhook_stats(db, agent_id),
            }

    @mcp.tool()
    def update_summaries(
        agent_id: int,
        enabled: Optional[bool] = None,
        delay_minutes: Optional[int] = None,
        min_messages: Optional[int] = None,
        max_messages: Optional[int] = None,
        webhook_url: Optional[str] = None,
        webhook_retry_count: Optional[int] = None,
        webhook_retry_delay: Optional[int] = None,
        summary_prompt: Optional[str] = None,
    ) -> dict:
        """Update webhook summary settings. Super-admin only. Same fields as the Summaries tab."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            agent = require_agent(db, user, agent_id)
            updates = {
                key: value
                for key, value in {
                    "enabled": enabled,
                    "delay_minutes": delay_minutes,
                    "min_messages": min_messages,
                    "max_messages": max_messages,
                    "webhook_url": webhook_url,
                    "webhook_retry_count": webhook_retry_count,
                    "webhook_retry_delay": webhook_retry_delay,
                    "summary_prompt": summary_prompt,
                }.items()
                if value is not None
            }
            if not updates:
                raise fail("אין מה לעדכן")
            try:
                config = apply_summary_updates(agent, updates)
            except ValueError as exc:
                raise fail(str(exc)) from exc
            db.commit()
            return config

    @mcp.tool()
    async def test_summaries_webhook(agent_id: int) -> dict:
        """POST a test payload to the configured summary webhook URL."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            agent = require_agent(db, user, agent_id)
            webhook_url = get_summary_config(agent).get("webhook_url")
            if not webhook_url:
                raise fail("אין כתובת וובהוק מוגדרת")
            payload = {
                "event": "test",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "agent_id": agent.id,
                "agent_name": agent.name,
                "message": "This is a test webhook from WhatsApp Agent",
            }
        success, error = await send_test_webhook(webhook_url, payload)
        if not success:
            raise fail(f"וובהוק נכשל: {error}")
        return {"status": "sent"}

    @mcp.tool()
    def list_conversation_summaries(agent_id: int, limit: int = 20) -> list[dict]:
        """Recent generated conversation summaries and webhook delivery status."""
        with db_session() as db:
            user = current_user(db)
            require_agent(db, user, agent_id)
            capped = max(1, min(50, int(limit)))
            rows = (
                db.query(ConversationSummary, User)
                .join(User, User.id == ConversationSummary.user_id)
                .filter(ConversationSummary.agent_id == agent_id)
                .order_by(ConversationSummary.created_at.desc())
                .limit(capped)
                .all()
            )
            return [
                {
                    "id": row.id,
                    "conversation_id": row.conversation_id,
                    "user_id": row.user_id,
                    "phone": contact.phone,
                    "user_name": contact.name,
                    "summary_text": row.summary_text,
                    "message_count": row.message_count,
                    "webhook_status": row.webhook_status,
                    "webhook_attempts": row.webhook_attempts,
                    "webhook_last_error": row.webhook_last_error,
                    "webhook_sent_at": row.webhook_sent_at.isoformat() if row.webhook_sent_at else None,
                    "last_message_at": row.last_message_at.isoformat() if row.last_message_at else None,
                    "created_at": row.created_at.isoformat() if row.created_at else None,
                }
                for row, contact in rows
            ]
