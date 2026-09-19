from sqlalchemy.orm import Session

from backend.core.logger import log
from backend.models.agent import Agent
from backend.models.agent_channel import AgentChannel
from backend.services.wasender import sessions
from backend.services.wasender.http import SessionApiError
from backend.services.wasender.lifecycle import (
    CHANNEL_TYPE,
    _normalize_status,
    _remote_id,
    _require_pat,
    _session_id,
    remove_line,
)

STALE = {"disconnected", "logged_out", "expired", "unknown"}


def _keep_ids(db: Session, keep: str) -> set[int]:
    needle = (keep or "").strip().lower()
    if len(needle) < 3:
        return set()
    return {
        row.id
        for row in db.query(Agent).filter(Agent.name.isnot(None)).all()
        if needle in row.name.lower()
    }


def _local_by_remote(db: Session, session_id: int) -> AgentChannel | None:
    rows = (
        db.query(AgentChannel)
        .filter(AgentChannel.channel_type == CHANNEL_TYPE)
        .all()
    )
    for channel in rows:
        try:
            if _session_id(channel) == session_id:
                return channel
        except Exception:
            continue
    return None


def _view(row: dict, channel: AgentChannel | None, agent_name: str | None) -> dict:
    return {
        "wasender_session_id": _remote_id(row),
        "phone": row.get("phone_number"),
        "name": row.get("name"),
        "status": _normalize_status(row.get("status")),
        "agent_id": channel.agent_id if channel else None,
        "agent_name": agent_name,
        "channel_id": channel.id if channel else None,
    }


async def list_provider(db: Session) -> list[dict]:
    remote_rows = await sessions.list_sessions(_require_pat(db))
    names = {row.id: row.name for row in db.query(Agent).all()}
    out = []
    for row in remote_rows:
        rid = _remote_id(row)
        if rid is None:
            continue
        channel = _local_by_remote(db, rid)
        out.append(_view(row, channel, names.get(channel.agent_id) if channel else None))
    return out


async def drop_provider(db: Session, session_id: int) -> dict:
    remote_ok = True
    try:
        await sessions.delete_session(_require_pat(db), session_id)
    except SessionApiError as error:
        if error.status_code != 404:
            raise
        remote_ok = False
    local = None
    channel = _local_by_remote(db, session_id)
    if channel:
        local = await remove_line(db, channel)
    log("wasender_dbg", op="drop_provider", session_id=session_id, remote_ok=remote_ok)
    return {"wasender_session_id": session_id, "remote_ok": remote_ok, "local": local}


async def purge_stale(db: Session, keep: str = "nella") -> dict:
    keep_ids = _keep_ids(db, keep)
    dropped = []
    skipped = 0
    for row in await list_provider(db):
        rid = row.get("wasender_session_id")
        if rid is None:
            continue
        if row.get("agent_id") in keep_ids:
            skipped += 1
            continue
        if row.get("status") not in STALE:
            skipped += 1
            continue
        dropped.append(await drop_provider(db, int(rid)))
    leftovers = (
        db.query(AgentChannel)
        .filter(AgentChannel.channel_type == CHANNEL_TYPE)
        .all()
    )
    for channel in leftovers:
        if channel.agent_id in keep_ids:
            continue
        if (channel.health_status or "unknown") == "connected":
            continue
        dropped.append(await remove_line(db, channel))
    log("wasender_dbg", op="purge_stale", dropped=len(dropped), skipped=skipped)
    return {"dropped": dropped, "skipped": skipped}
