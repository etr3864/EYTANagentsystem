from backend.models.agent_channel import AgentChannel
from backend.models.channel_user import ChannelUser
from backend.models.user import User
from backend.services.channels.agent_channels import get_channel_by_type
from backend.services.channels.channel_users import (
    IncomingUserInfo,
    get_by_id,
    get_or_create_for_incoming,
)
from backend.services.media.storage import cache_profile_pic
from backend.services.messaging.outbound import normalize_msisdn, OutboundError
from backend.services.wasender import sessions
from backend.services.wasender.http import SessionApiError
from backend.services.wasender.roster import _session_key

NOTE_MAX = 2000


def wasender_channel(db, agent_id: int) -> AgentChannel:
    channel = get_channel_by_type(db, agent_id, "whatsapp_wasender")
    if not channel:
        raise ValueError("אין חיבור WhatsApp")
    return channel


def parse_target(raw: str) -> tuple[str, str]:
    jid = (raw or "").strip()
    if jid.endswith("@g.us"):
        return "group", jid
    try:
        return "contact", normalize_msisdn(jid)
    except OutboundError as exc:
        raise ValueError(str(exc)) from exc


# GET /contacts/{phone} documents status:null. The address-book list is the
# payload that actually includes About text. Ignore session-health words.
_NOT_ABOUT = {
    "connected", "disconnected", "connecting", "need_scan", "need_passkey",
    "logged_out", "expired", "null", "none", "undefined",
}


def _about_value(raw) -> str:
    if isinstance(raw, dict):
        for key in ("status", "text", "about", "desc", "message"):
            text = _about_value(raw.get(key))
            if text:
                return text
        return ""
    if isinstance(raw, (int, float, bool)):
        return ""
    text = str(raw or "").strip()
    if not text or text.lower() in _NOT_ABOUT:
        return ""
    return text


def _about(remote: dict) -> str:
    for key in ("status", "desc", "about", "description", "statusText"):
        text = _about_value(remote.get(key))
        if text:
            return text
    return ""


def _digits_id(raw: str) -> str:
    return "".join(c for c in str(raw or "").split("@", 1)[0] if c.isdigit())


def _same_phone(row: dict, phone: str) -> bool:
    left = _digits_id(phone)
    right = _digits_id(str(row.get("jid") or row.get("id") or ""))
    if len(left) >= 8 and len(right) >= 8:
        n = min(len(left), len(right), 10)
        return left[-n:] == right[-n:]
    return bool(left) and left == right


async def _with_book_about(token: str, phone: str, remote: dict) -> dict:
    """GET /contacts/{id} documents status:null. About lives on the address-book list."""
    if _about(remote):
        return remote
    found = await _lookup_book(token, phone)
    if not found or not _about(found):
        return remote
    merged = dict(remote)
    merged.update({key: value for key, value in found.items() if value not in (None, "")})
    return merged


async def _lookup_book(token: str, phone: str) -> dict:
    try:
        for page in range(1, 11):
            rows, more = await sessions.list_contacts_page(token, page)
            for row in rows:
                if _same_phone(row, phone):
                    return row
            if not more:
                break
    except SessionApiError:
        return {}
    return {}


def _http_img(raw) -> str:
    url = str(raw or "").strip()
    return url if url.startswith("http") else ""


def _identity(db, channel: AgentChannel, key: str, name: str) -> ChannelUser:
    cu_id = get_or_create_for_incoming(
        db, channel, IncomingUserInfo(external_id=key, display_name=name or None)
    )
    row = get_by_id(db, cu_id)
    if not row:
        raise ValueError("identity_missing")
    return row


async def _remote(token: str, kind: str, key: str) -> dict:
    try:
        if kind == "group":
            return await sessions.get_group(token, key)
        return await sessions.get_contact(token, key)
    except SessionApiError:
        return {}


async def _picture(db, token: str, kind: str, key: str, row: ChannelUser, remote: dict) -> str:
    if row.profile_pic_url:
        return row.profile_pic_url
    src = _http_img(remote.get("imgUrl") or remote.get("img_url"))
    if not src:
        try:
            src = await sessions.get_picture(token, key, group=kind == "group") or ""
        except SessionApiError:
            src = ""
    if not src:
        return ""
    cached = await cache_profile_pic(src, row.id)
    if cached:
        row.profile_pic_url = cached
        return cached
    return src


def _digits_phone(raw: str) -> str:
    text = str(raw or "").strip()
    if not text or text.endswith("@lid") or text.endswith("@g.us"):
        return ""
    try:
        return normalize_msisdn(text.split("@", 1)[0])
    except OutboundError:
        return ""


def _participant_row(item: dict) -> dict | None:
    if not isinstance(item, dict):
        return None
    jid = str(item.get("jid") or item.get("id") or "").strip()
    if not jid or jid.endswith("@g.us"):
        return None
    phone = _digits_phone(item.get("phone") or item.get("pn") or jid)
    return {
        "jid": jid,
        "phone": phone,
        "name": str(item.get("name") or item.get("notify") or "").strip(),
        "is_admin": bool(item.get("isAdmin") or item.get("isSuperAdmin") or item.get("admin")),
        "can_open": bool(phone),
    }


def _fill_names(db, channel: AgentChannel, members: list[dict]) -> None:
    phones = [row["phone"] for row in members if row["phone"] and not row["name"]]
    if not phones:
        return
    named = {}
    for row in db.query(ChannelUser).filter(
        ChannelUser.channel_id == channel.id,
        ChannelUser.external_id.in_(phones),
    ).all():
        if row.display_name:
            named[row.external_id] = row.display_name
    still = [phone for phone in phones if phone not in named]
    if still:
        for user in db.query(User).filter(User.phone.in_(still)).all():
            if user.name:
                named[user.phone] = user.name
    for member in members:
        if member["phone"] and not member["name"] and member["phone"] in named:
            member["name"] = named[member["phone"]]


def _participants(db, channel: AgentChannel, remote: dict) -> list[dict]:
    raw = remote.get("participants") if isinstance(remote.get("participants"), list) else []
    members = []
    for item in raw:
        row = _participant_row(item)
        if row:
            members.append(row)
    _fill_names(db, channel, members)
    return members


def _present(kind: str, key: str, remote: dict, row: ChannelUser, img: str, members: list[dict]) -> dict:
    name = (
        str(remote.get("subject") or remote.get("name") or remote.get("notify") or row.display_name or key)
    )
    return {
        "kind": kind,
        "jid": key if kind == "group" else f"{key}@s.whatsapp.net",
        "phone": "" if kind == "group" else key,
        "name": name.strip(),
        "notify": str(remote.get("notify") or "").strip(),
        "verified_name": str(remote.get("verifiedName") or "").strip(),
        "status": _about(remote),
        "img_url": img,
        "note": row.staff_note or "",
        "participants": members,
    }


async def load_card(db, channel: AgentChannel, raw_jid: str) -> dict:
    kind, key = parse_target(raw_jid)
    token = _session_key(channel)
    remote = await _remote(token, kind, key)
    if kind == "contact":
        remote = await _with_book_about(token, key, remote)
    name = str(remote.get("subject") or remote.get("name") or remote.get("notify") or "")
    row = _identity(db, channel, key, name)
    img = await _picture(db, token, kind, key, row, remote)
    if name and not row.display_name:
        row.display_name = name[:200]
    db.commit()
    members = _participants(db, channel, remote) if kind == "group" else []
    return _present(kind, key, remote, row, img, members)


def save_note(db, channel: AgentChannel, raw_jid: str, note: str) -> dict:
    kind, key = parse_target(raw_jid)
    row = _identity(db, channel, key, "")
    text = (note or "").strip()
    if len(text) > NOTE_MAX:
        raise ValueError(f"הערה עד {NOTE_MAX} תווים")
    row.staff_note = text or None
    db.commit()
    return {"jid": key if kind == "group" else f"{key}@s.whatsapp.net", "note": row.staff_note or ""}
