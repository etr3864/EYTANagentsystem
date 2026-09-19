from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth.dependencies import require_super_admin
from backend.auth.models import AuthUser
from backend.core.database import get_db
from backend.services.wasender.account import clear_pat, pat_configured, set_pat
from backend.services.wasender.lifecycle import adopt_existing
from backend.services.wasender.http import SessionApiError
from backend.services.wasender.purge import drop_provider, list_provider, wipe_except

router = APIRouter(tags=["wasender-account"])
_super_admin = Depends(require_super_admin())


class PatBody(BaseModel):
    pat: str


@router.get("/settings/wasender-pat")
def get_wasender_pat(
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    return {"configured": pat_configured(db)}


@router.put("/settings/wasender-pat")
def put_wasender_pat(
    body: PatBody,
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    try:
        set_pat(db, body.pat)
    except ValueError:
        raise HTTPException(status_code=400, detail="empty_pat")
    return {"configured": True}


@router.delete("/settings/wasender-pat")
def delete_wasender_pat(
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    clear_pat(db)
    return {"configured": False}


@router.post("/wasender/adopt")
async def adopt_wasender_sessions(
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    try:
        return await adopt_existing(db)
    except SessionApiError as error:
        raise HTTPException(status_code=error.status_code, detail=error.client_message())


@router.get("/wasender/provider-sessions")
async def provider_sessions(
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    try:
        return await list_provider(db)
    except SessionApiError as error:
        raise HTTPException(status_code=error.status_code, detail=error.client_message())


@router.delete("/wasender/provider-sessions/{session_id}")
async def delete_provider_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    try:
        return await drop_provider(db, session_id)
    except SessionApiError as error:
        raise HTTPException(status_code=error.status_code, detail=error.client_message())


@router.post("/wasender/wipe-except")
async def wipe_except_sessions(
    db: Session = Depends(get_db),
    current_user: AuthUser = _super_admin,
):
    try:
        return await wipe_except(db)
    except ValueError as error:
        detail = {
            "keep_not_found": "לא נמצא סוכן עם nella בשם",
            "keep_has_no_session": "ל-nella אין ערוץ לשמור. לא מוחקים כלום.",
        }.get(str(error), str(error))
        raise HTTPException(status_code=400, detail=detail)
    except SessionApiError as error:
        raise HTTPException(status_code=error.status_code, detail=error.client_message())

