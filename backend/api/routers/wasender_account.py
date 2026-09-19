from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.auth.dependencies import require_super_admin
from backend.auth.models import AuthUser
from backend.core.database import get_db
from backend.services.wasender.account import clear_pat, pat_configured, set_pat
from backend.services.wasender.lifecycle import adopt_existing
from backend.services.wasender.http import SessionApiError

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
        raise HTTPException(status_code=error.status_code, detail=error.message)
