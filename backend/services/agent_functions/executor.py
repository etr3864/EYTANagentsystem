from dataclasses import dataclass
from typing import Any, Optional

from backend.core.config import settings
from backend.core.database import SessionLocal
from backend.core.logger import log_error
from backend.models.agent_function import AgentFunctionRun
from backend.models.conversation_context_summary import ConversationContextSummary
from backend.services.entities import conversations, users
from backend.services.agent_functions import breaker, errors as fn_errors
from backend.services.agent_functions import http_client, idempotency, repo, resolve, state, tester, wrap
from backend.services.agent_functions.budget import TurnBudget
from backend.services.agent_functions.egress import EgressDenied
from backend.services.agent_functions.outputs import mapped_outputs
from backend.services.agent_functions.template import MissingVariableError

WRITE_AMBIGUOUS = frozenset({"timeout", "unavailable", "indeterminate"})


@dataclass
class PreparedCall:
    function_id: int
    agent_id: int
    user_id: int
    conversation_id: int
    name: str
    method: str
    allowed_host: str
    timeout_ms: int
    outputs: list
    response_instructions: str
    side_effect: str
    values: dict
    url: str
    headers: dict
    body: Optional[str]
    idempotency_key: Optional[str]


async def run(
    agent_id: int,
    user_id: int,
    conversation_id: int,
    name: str,
    args: dict[str, Any],
    budget: TurnBudget,
) -> str:
    prepared = _prepare(agent_id, user_id, conversation_id, name, args, budget)
    if isinstance(prepared, str):
        return prepared
    return await _call_http(prepared, budget)


def _prepare(
    agent_id: int,
    user_id: int,
    conversation_id: int,
    name: str,
    args: dict[str, Any],
    budget: TurnBudget,
) -> PreparedCall | str:
    if not settings.agent_functions_enabled:
        return wrap.error(fn_errors.tool_error("denied", "פונקציות API כבויות."))
    db = SessionLocal()
    try:
        return _prepare_in_session(db, agent_id, user_id, conversation_id, name, args, budget)
    except MissingVariableError as exc:
        db.rollback()
        return wrap.error(fn_errors.tool_error("invalid_input", f"חסר משתנה: {exc.name}"))
    except EgressDenied as exc:
        db.rollback()
        return wrap.error(fn_errors.tool_error("denied", str(exc)[:200]))
    except ValueError as exc:
        db.rollback()
        return wrap.error(fn_errors.tool_error("invalid_input", str(exc)[:200]))
    except Exception:
        db.rollback()
        log_error("agent_function_prepare", name)
        return wrap.error(fn_errors.tool_error("unavailable", "השירות לא זמין כרגע."))
    finally:
        db.close()


def _prepare_in_session(db, agent_id, user_id, conversation_id, name, args, budget) -> PreparedCall | str:
    row = repo.get_by_name(db, agent_id, name)
    user = users.get_by_id(db, user_id)
    conversation = conversations.get_by_id(db, conversation_id)
    if not row or not row.enabled or row.trigger != "conversation":
        return wrap.error(fn_errors.tool_error("denied", "הפונקציה לא זמינה."))
    if not user or not conversation:
        return wrap.error(fn_errors.tool_error("unavailable", "חסר קונטקסט."))
    values, err = resolve.resolve_params(row, args, user, conversation, _summary(db, conversation_id))
    if err:
        return wrap.error(err)
    if not breaker.allow(row.id):
        return wrap.error(fn_errors.tool_error("unavailable", "השירות לא זמין כרגע."))
    if not budget.can_http():
        return wrap.error(_timeout_contract(row.side_effect))
    key = None
    if row.side_effect == "write":
        key = idempotency.make_key(conversation_id, row.id, values)
        action, rec = idempotency.reserve(db, key, row.id, agent_id, conversation_id)
        if action == "replay":
            db.commit()
            return _replay(rec, row.response_instructions)
        if action != "proceed":
            db.commit()
            return wrap.error(_indeterminate())
    built = tester.build_request(row, values)
    prepared = PreparedCall(
        function_id=row.id,
        agent_id=agent_id,
        user_id=user_id,
        conversation_id=conversation_id,
        name=row.name,
        method=row.method,
        allowed_host=row.allowed_host,
        timeout_ms=budget.timeout_ms(row.timeout_ms),
        outputs=list(row.outputs or []),
        response_instructions=row.response_instructions or "",
        side_effect=row.side_effect,
        values=values,
        url=built["url"],
        headers=built["headers"],
        body=built["body"],
        idempotency_key=key,
    )
    db.commit()
    return prepared


async def _call_http(prepared: PreparedCall, budget: TurnBudget) -> str:
    if not budget.can_http():
        _close_write(prepared, "indeterminate", error="timeout")
        return wrap.error(_timeout_contract(prepared.side_effect))
    result = await http_client.request(
        agent_id=prepared.agent_id,
        method=prepared.method,
        url=prepared.url,
        allowed_host=prepared.allowed_host,
        headers=prepared.headers,
        body=prepared.body,
        timeout_ms=budget.timeout_ms(prepared.timeout_ms),
    )
    contract = fn_errors.from_http(
        result.status_code, result.timed_out, prepared.side_effect, result.error
    )
    if prepared.side_effect == "write" and contract and contract["code"] == "unavailable":
        contract = _indeterminate()
    if contract:
        _finish_error(prepared, result, contract)
        return wrap.error(contract)
    mapped = mapped_outputs(result.body, prepared.outputs)
    breaker.record_success(prepared.function_id)
    _finish_ok(prepared, result, mapped)
    return wrap.success(mapped, prepared.response_instructions)


def _finish_ok(prepared: PreparedCall, result, mapped: dict) -> None:
    db = SessionLocal()
    try:
        if prepared.idempotency_key:
            idempotency.finalize(db, prepared.idempotency_key, "done", outputs=mapped)
        user = users.get_by_id(db, prepared.user_id)
        conversation = conversations.get_by_id(db, prepared.conversation_id)
        if user and conversation:
            state.save_mapped(
                db, user, conversation, prepared.agent_id, prepared.name, mapped, prepared.outputs
            )
        db.add(_run_row(prepared, "ok", result, None))
        db.commit()
    except Exception:
        db.rollback()
        log_error("agent_function_finalize", prepared.name)
    finally:
        db.close()


def _finish_error(prepared: PreparedCall, result, contract: dict) -> None:
    code = contract.get("code") or "unavailable"
    if code in WRITE_AMBIGUOUS:
        breaker.record_failure(prepared.function_id)
    write_status = None
    if prepared.idempotency_key:
        write_status = "indeterminate" if code in WRITE_AMBIGUOUS else "done"
    db = SessionLocal()
    try:
        if write_status:
            idempotency.finalize(db, prepared.idempotency_key, write_status, error=code)
        run_status = "indeterminate" if code == "indeterminate" else "error"
        db.add(_run_row(prepared, run_status, result, code))
        db.commit()
    except Exception:
        db.rollback()
        log_error("agent_function_run", prepared.name)
    finally:
        db.close()


def _close_write(prepared: PreparedCall, status: Optional[str], error: Optional[str] = None) -> None:
    if not prepared.idempotency_key or not status:
        return
    db = SessionLocal()
    try:
        idempotency.finalize(db, prepared.idempotency_key, status, error=error)
        db.commit()
    except Exception:
        db.rollback()
        log_error("agent_function_idempotency", prepared.name)
    finally:
        db.close()


def _run_row(prepared: PreparedCall, status: str, result, error: Optional[str]) -> AgentFunctionRun:
    return AgentFunctionRun(
        function_id=prepared.function_id,
        agent_id=prepared.agent_id,
        status=status,
        latency_ms=getattr(result, "latency_ms", 0) or 0,
        request_preview={"method": prepared.method, "url": prepared.url, "headers": {k: "***" for k in prepared.headers}},
        response_preview=_clip(getattr(result, "body", None)),
        error=str(error)[:500] if error else None,
    )


def _clip(body) -> dict | None:
    if body is None:
        return None
    if isinstance(body, dict):
        return body
    return {"text": str(body)[:2000]}


def _summary(db, conversation_id: int) -> str:
    row = (
        db.query(ConversationContextSummary)
        .filter(ConversationContextSummary.conversation_id == conversation_id)
        .first()
    )
    return (row.summary_text or "") if row else ""


def _replay(rec, instructions: str) -> str:
    if rec.error:
        if rec.error in WRITE_AMBIGUOUS:
            return wrap.error(_indeterminate() if rec.error != "timeout" else _timeout_contract("write"))
        return wrap.error(fn_errors.tool_error(rec.error, "הבקשה נדחתה. בדוק את הפרמטרים."))
    return wrap.success(rec.outputs or {}, instructions)


def _timeout_contract(side_effect: str) -> dict:
    return fn_errors.from_http(None, True, side_effect, "timeout")


def _indeterminate() -> dict:
    return fn_errors.tool_error(
        "indeterminate",
        "הכתיבה לא אושרה. אסור לנסות שוב. אל תגיד ללקוח שהצליח.",
        "אנחנו בודקים את זה.",
    )
