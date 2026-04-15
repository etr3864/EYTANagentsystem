"""Conversation export endpoint — Super Admin only.

Returns a streaming Excel (.xlsx) file with two sheets:
  - Summary: date range, agent name, total conversations, export date.
  - Conversations: one row per conversation with full chronological text.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.auth.dependencies import require_super_admin
from backend.auth.models import AuthUser
from backend.core.database import get_db
from backend.services.export_builder import build_export

logger = logging.getLogger(__name__)
router = APIRouter(tags=["export"])

_require_super_admin = require_super_admin()

_DATE_PATTERN = r"^\d{4}-\d{2}-\d{2}$"
_XLSX_MEDIA_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)


@router.get("/super-admin/agents/{agent_id}/export")
def export_conversations(
    agent_id: int,
    from_date: str = Query(..., pattern=_DATE_PATTERN),
    to_date: str = Query(..., pattern=_DATE_PATTERN),
    _: AuthUser = Depends(_require_super_admin),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    if to_date < from_date:
        raise HTTPException(status_code=400, detail="to_date must be >= from_date")

    try:
        buffer, filename = build_export(db, agent_id, from_date, to_date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Export failed for agent %d: %s", agent_id, exc)
        raise HTTPException(status_code=500, detail="Export failed") from exc

    return StreamingResponse(
        buffer,
        media_type=_XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
