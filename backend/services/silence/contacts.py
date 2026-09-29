"""Address book copied from Wasender. The phone itself is never written."""
import asyncio
from datetime import datetime

from sqlalchemy.orm import Session

from backend.core.database import SessionLocal
from backend.core.logger import log, log_error
from backend.models.saved_contact import SavedContact
from backend.services.channels.agent_channels import get_channel, get_credentials
from backend.services.entities import agents
from backend.services.silence.phones import canonical
from backend.services.wasender.http import request

_PHONE_JID = "@s.whatsapp.net"


def schedule_pull(channel_id: int) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(pull_channel(channel_id))


async def pull_channel(channel_id: int) -> None:
    with SessionLocal() as db:
        channel = get_channel(db, channel_id)
        if channel is None:
            return
        agent = agents.get_by_id(db, channel.agent_id)
        if agent is None or not agent.skip_saved_contacts:
            return
        try:
            api_key = (get_credentials(channel).get("api_key") or "").strip()
        except Exception:
            api_key = ""
        if not api_key:
            log_error("silence_contacts", f"channel {channel_id} has no session key")
            return
    try:
        body = await request("GET", "/contacts", api_key, timeout=60)
        rows = pairs_from_list(body)
    except Exception as error:
        log_error("silence_contacts", f"pull {channel_id}: {str(error)[:80]}")
        return
    await asyncio.to_thread(_store_pull, channel_id, rows)
    log("silence_contacts", channel_id=channel_id, rows=len(rows))


def _store_pull(channel_id: int, rows: list[tuple[str, str]]) -> None:
    with SessionLocal() as db:
        channel = get_channel(db, channel_id)
        agent = agents.get_by_id(db, channel.agent_id) if channel else None
        if channel is None or agent is None or not agent.skip_saved_contacts:
            return
        replace_book(db, channel, rows)
        db.commit()


def apply_upsert(channel_id: int, payload: dict) -> None:
    with SessionLocal() as db:
        channel = get_channel(db, channel_id)
        if channel is None:
            return
        agent = agents.get_by_id(db, channel.agent_id)
        if agent is None or not agent.skip_saved_contacts:
            return
        if note_rows(db, channel_id, payload):
            db.commit()


def forget_book(db: Session, channel) -> None:
    db.query(SavedContact).filter(SavedContact.channel_id == channel.id).delete(
        synchronize_session=False
    )
    channel.contacts_synced_at = None


def replace_book(db: Session, channel, rows: list[tuple[str, str]]) -> None:
    """Upsert names. Excluded rows stay, including ones missing from this pull."""
    existing = {
        row.phone: row
        for row in db.query(SavedContact).filter(SavedContact.channel_id == channel.id).all()
    }
    seen: set[str] = set()
    for phone, name in rows:
        seen.add(phone)
        current = existing.get(phone)
        if current is None:
            db.add(SavedContact(channel_id=channel.id, phone=phone, name=name))
            continue
        if not current.excluded:
            current.name = name
    for phone, current in existing.items():
        if phone not in seen and not current.excluded:
            db.delete(current)
    channel.contacts_synced_at = datetime.utcnow()


def note_rows(db: Session, channel_id: int, payload: dict) -> bool:
    changed = False
    for phone, name in pairs_from_upsert(payload):
        row = (
            db.query(SavedContact)
            .filter(SavedContact.channel_id == channel_id, SavedContact.phone == phone)
            .first()
        )
        if row is None:
            db.add(SavedContact(channel_id=channel_id, phone=phone, name=name))
            changed = True
        elif not row.excluded and row.name != name:
            row.name = name
            changed = True
    return changed


def pairs_from_list(body) -> list[tuple[str, str]]:
    if not isinstance(body, dict) or not isinstance(body.get("data"), list):
        raise ValueError("contacts payload")
    return _pairs(body["data"])


def pairs_from_upsert(payload: dict) -> list[tuple[str, str]]:
    data = payload.get("data")
    raw: list = []
    if isinstance(data, list):
        raw = data
    elif isinstance(data, dict):
        inner = data.get("contacts") or data.get("contact")
        if isinstance(inner, list):
            raw = inner
        elif isinstance(inner, dict):
            raw = [inner]
        elif data.get("jid") or data.get("id"):
            raw = [data]
    return _pairs(raw)


def _pairs(raw: list) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    seen: set[str] = set()
    for row in raw:
        if not isinstance(row, dict):
            continue
        jid = str(row.get("jid") or row.get("id") or "")
        if not jid.endswith(_PHONE_JID):
            continue
        name = str(row.get("name") or "").strip()
        if not name:
            continue
        phone = canonical(jid)
        if not phone or phone in seen:
            continue
        seen.add(phone)
        found.append((phone, name[:120]))
    return found
