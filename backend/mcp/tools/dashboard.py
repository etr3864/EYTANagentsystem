from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import HTTPException

from backend.api.routers import super_admin_dashboard as dash
from backend.mcp.ctx import current_user, db_session, fail, require_super


def register(mcp) -> None:
    @mcp.tool()
    def get_system_costs(from_date: Optional[str] = None, to_date: Optional[str] = None) -> dict:
        """System-wide cost and conversation totals (same as super-admin dashboard). Dates YYYY-MM-DD. Default: last 30 days."""
        start, end = _dates(from_date, to_date)
        with db_session() as db:
            user = _auth(db)
            return _call(lambda: dash.get_system_summary(from_date=start, to_date=end, db=db, _=user)).model_dump()

    @mcp.tool()
    def list_agent_costs(from_date: Optional[str] = None, to_date: Optional[str] = None) -> list[dict]:
        """Per-agent cost and volume table (same as super-admin dashboard). Dates YYYY-MM-DD. Default: last 30 days."""
        start, end = _dates(from_date, to_date)
        with db_session() as db:
            user = _auth(db)
            rows = _call(lambda: dash.get_agents_table(from_date=start, to_date=end, db=db, _=user))
            return [row.model_dump() for row in rows]

    @mcp.tool()
    def get_agent_performance(
        agent_id: int,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        channel_type: Optional[str] = None,
    ) -> dict:
        """Cost and performance for one agent: conversations, messages, appointments, follow-ups, cost by provider/source.
        Dates YYYY-MM-DD. Default: last 30 days. channel_type optional (whatsapp_meta, instagram, messenger)."""
        start, end = _dates(from_date, to_date)
        with db_session() as db:
            user = _auth(db)
            row = _call(
                lambda: dash.get_agent_detail(
                    agent_id=agent_id,
                    from_date=start,
                    to_date=end,
                    channel_type=channel_type,
                    db=db,
                    _=user,
                )
            )
            return row.model_dump()


def _auth(db):
    user = current_user(db)
    require_super(user)
    return user


def _call(fn):
    try:
        return fn()
    except HTTPException as exc:
        raise fail(str(exc.detail)) from exc


def _dates(from_date: Optional[str], to_date: Optional[str]) -> tuple[date, date]:
    try:
        end = date.fromisoformat(to_date) if to_date else date.today()
        start = date.fromisoformat(from_date) if from_date else end - timedelta(days=30)
    except ValueError as exc:
        raise fail("תאריך חייב להיות YYYY-MM-DD") from exc
    if end < start:
        raise fail("to_date חייב להיות אחרי from_date")
    return start, end
