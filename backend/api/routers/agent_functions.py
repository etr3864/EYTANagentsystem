from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.auth.dependencies import get_current_user
from backend.auth.models import AuthUser, UserRole
from backend.auth import service as auth_service
from backend.models.agent_function import AgentFunctionRun
from backend.services.agent_functions import commands, present, repo, tester
from backend.services.agent_functions.egress import EgressDenied
from backend.services.agent_functions.names import FunctionNameError
from backend.services.agent_functions.present import can_enable
from backend.services.agent_functions.schemas import AttentionResolve, FunctionPatch, FunctionTestRequest, FunctionUpsert

router = APIRouter(prefix="/agents/{agent_id}/functions", tags=["agent-functions"])


def _super_admin_agent(
    agent_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AuthUser:
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Super admin only")
    if not auth_service.can_access_agent(db, current_user, agent_id):
        raise HTTPException(status_code=403, detail="No access to this agent")
    return current_user


@router.get("")
def list_functions(
    agent_id: int,
    _: AuthUser = Depends(_super_admin_agent),
    db: Session = Depends(get_db),
):
    rows = repo.list_for_agent(db, agent_id)
    return [present.to_public(row) for row in rows]


@router.get("/attention")
def list_attention(
    agent_id: int,
    _: AuthUser = Depends(_super_admin_agent),
    db: Session = Depends(get_db),
):
    return [present.attention_item(row, name) for row, name in repo.list_attention(db, agent_id)]


@router.post("/attention/{row_id}/resolve")
def resolve_attention(
    agent_id: int,
    row_id: int,
    data: AttentionResolve,
    _: AuthUser = Depends(_super_admin_agent),
    db: Session = Depends(get_db),
):
    row = repo.get_idempotency(db, agent_id, row_id)
    if not row:
        raise HTTPException(status_code=404, detail="לא נמצא")
    if data.action == "retry":
        if row.status == "in_flight" and not present.attention_item(row, "").get("stale"):
            raise HTTPException(status_code=400, detail="הכתיבה עדיין בתהליך")
        db.delete(row)
        db.commit()
        return {"status": "retry"}
    row.status = "done"
    if data.outputs:
        row.outputs = data.outputs
        row.error = None
    db.commit()
    return {"status": "done"}


@router.post("")
def create_function(
    agent_id: int,
    data: FunctionUpsert,
    _: AuthUser = Depends(_super_admin_agent),
    db: Session = Depends(get_db),
):
    if repo.at_capacity(db, agent_id):
        raise HTTPException(status_code=400, detail="הגעת למקסימום פונקציות לסוכן")
    try:
        row = commands.create_from_upsert(db, agent_id, data)
    except (ValueError, FunctionNameError, EgressDenied, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return present.to_public(row)


@router.get("/{function_id}")
def get_function(
    agent_id: int,
    function_id: int,
    _: AuthUser = Depends(_super_admin_agent),
    db: Session = Depends(get_db),
):
    row = repo.get(db, agent_id, function_id)
    if not row:
        raise HTTPException(status_code=404, detail="Function not found")
    return present.to_public(row)


@router.put("/{function_id}")
def update_function(
    agent_id: int,
    function_id: int,
    data: FunctionUpsert,
    _: AuthUser = Depends(_super_admin_agent),
    db: Session = Depends(get_db),
):
    row = repo.get(db, agent_id, function_id)
    if not row:
        raise HTTPException(status_code=404, detail="Function not found")
    try:
        row = commands.update_from_upsert(db, row, data, _headers_provided(data.headers))
    except (ValueError, FunctionNameError, EgressDenied, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return present.to_public(row)


@router.patch("/{function_id}")
def patch_function(
    agent_id: int,
    function_id: int,
    data: FunctionPatch,
    _: AuthUser = Depends(_super_admin_agent),
    db: Session = Depends(get_db),
):
    row = repo.get(db, agent_id, function_id)
    if not row:
        raise HTTPException(status_code=404, detail="Function not found")
    if data.enabled is True and not can_enable(row):
        raise HTTPException(status_code=400, detail="צריך טסט תקין לפני הפעלה")
    if data.enabled is not None:
        row.enabled = data.enabled
    if data.sort_order is not None:
        row.sort_order = data.sort_order
    repo.save(db, row)
    return present.to_public(row)


@router.delete("/{function_id}")
def delete_function(
    agent_id: int,
    function_id: int,
    _: AuthUser = Depends(_super_admin_agent),
    db: Session = Depends(get_db),
):
    row = repo.get(db, agent_id, function_id)
    if not row:
        raise HTTPException(status_code=404, detail="Function not found")
    repo.delete(db, row)
    return {"status": "deleted"}


@router.post("/{function_id}/test")
async def test_function(
    agent_id: int,
    function_id: int,
    data: FunctionTestRequest,
    _: AuthUser = Depends(_super_admin_agent),
    db: Session = Depends(get_db),
):
    row = repo.get(db, agent_id, function_id)
    if not row:
        raise HTTPException(status_code=404, detail="Function not found")
    result = await tester.run_test(row, data.sample_values, data.live, data.header_overrides)
    ok = bool(result.get("ok"))
    repo.mark_test(row, live=data.live, ok=ok)
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


def _headers_provided(headers: dict[str, str]) -> bool:
    return any(value and not value.startswith("...") for value in headers.values())


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
    return str(err.get("message_for_model") or err.get("code") or "")[:500]
