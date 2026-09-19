from sqlalchemy.orm import Session

from backend.core.logger import log
from backend.models.agent import Agent
from backend.models.agent_channel import AgentChannel
from backend.services.channels.agent_channels import get_credentials
from backend.services.wasender import sessions
from backend.services.wasender.http import SessionApiError
from backend.services.wasender.cleanup import wipe_channel_runtime
from backend.services.wasender.lifecycle import (
    CHANNEL_TYPE,
    _digits,
    _normalize_status,
    _remote_id,
    _require_pat,
    _session_id,
    remove_line,
)


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


def _keep_sessions(db: Session, keep_ids: set[int]) -> tuple[set[int], set[str]]:
    session_ids: set[int] = set()
    phones: set[str] = set()
    rows = (
        db.query(AgentChannel)
        .filter(
            AgentChannel.channel_type == CHANNEL_TYPE,
            AgentChannel.agent_id.in_(keep_ids),
        )
        .all()
    )
    for channel in rows:
        try:
            sid = _session_id(channel)
        except Exception:
            sid = None
        if sid is not None:
            session_ids.add(sid)
        try:
            phone = _digits(get_credentials(channel).get("phone_number") or channel.external_account_id)
        except Exception:
            phone = _digits(channel.external_account_id)
        if phone:
            phones.add(phone)
    return session_ids, phones


async def wipe_except(db: Session, keep: str = "nella") -> dict:
    keep_ids = _keep_ids(db, keep)
    if not keep_ids:
        raise ValueError("keep_not_found")
    keep_sids, keep_phones = _keep_sessions(db, keep_ids)
    if not keep_sids and not keep_phones:
        raise ValueError("keep_has_no_session")
    pat = _require_pat(db)
    dropped = []
    skipped = 0
    for row in await sessions.list_sessions(pat):
        rid = _remote_id(row)
        phone = _digits(row.get("phone_number"))
        if rid is None:
            continue
        if rid in keep_sids or (phone and phone in keep_phones):
            skipped += 1
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
        if channel.agent_id in keep_ids:
            continue
        await wipe_channel_runtime(db, channel)
        db.delete(channel)
        local += 1
    db.commit()
    log("wasender_dbg", op="wipe_except", keep=keep, remote=len(dropped), local=local, skipped=skipped)
    return {"dropped": dropped, "local": local, "skipped": skipped, "kept": len(keep_ids)}
