from fastapi import APIRouter, HTTPException

from backend.core.database import SessionLocal
from backend.services.wasender.http import SessionApiError
from backend.services.wasender.qr_share import refresh, resolve, snapshot

router = APIRouter(tags=["wasender-qr-public"])


def _open(raw: str):
    db = SessionLocal()
    try:
        return db, *resolve(db, raw)
    except LookupError:
        db.close()
        raise HTTPException(status_code=404, detail="הקישור לא תקף או שפג")


@router.get("/api/wa-qr/{token}")
async def wa_qr_state(token: str):
    db, _link, channel = _open(token)
    try:
        return await snapshot(db, channel)
    finally:
        db.close()


@router.post("/api/wa-qr/{token}/refresh")
async def wa_qr_refresh(token: str):
    db, _link, channel = _open(token)
    try:
        return await refresh(db, channel)
    except SessionApiError as error:
        raise HTTPException(status_code=error.status_code, detail="לא הצלחנו לרענן. נסה שוב.")
    finally:
        db.close()
