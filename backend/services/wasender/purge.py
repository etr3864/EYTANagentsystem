from sqlalchemy.orm import Session

from backend.core.logger import log
from backend.models.agent import Agent
from backend.models.agent_channel import AgentChannel
from backend.services.wasender import sessions
from backend.services.wasender.http import SessionApiError
from backend.services.wasender.cleanup import wipe_channel_runtime
from backend.services.wasender.lifecycle import (
    CHANNEL_TYPE,
    _normalize_status,
    _remote_id,
    _require_pat,
    _session_id,
    remove_line,
)


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


async def wipe_all(db: Session) -> dict:
    dropped = []
    pat = None
    try:
        pat = _require_pat(db)
    except SessionApiError:
        pat = None
    if pat:
        for row in await sessions.list_sessions(pat):
            rid = _remote_id(row)
            if rid is None:
                continue
            try:
                await sessions.delete_session(pat, rid)
                remote_ok = True
            except SessionApiError as error:
                if error.status_code != 404:
                    raise
                remote_ok = False
            dropped.append({"wasender_session_id": rid, "remote_ok": remote_ok})
    leftovers = (
        db.query(AgentChannel)
        .filter(AgentChannel.channel_type == CHANNEL_TYPE)
        .all()
    )
    local = 0
    for channel in leftovers:
        await wipe_channel_runtime(db, channel)
        db.delete(channel)
        local += 1
    db.commit()
    log("wasender_dbg", op="wipe_all", remote=len(dropped), local=local)
    return {"remote": len(dropped), "local": local}
