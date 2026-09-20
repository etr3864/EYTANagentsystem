from backend.models.agent_channel import AgentChannel
from backend.services.channels.agent_channels import get_credentials
from backend.services.wasender import sessions

CONTACTS_LIMIT = 50


def _session_key(channel: AgentChannel) -> str:
    key = str(get_credentials(channel).get("api_key") or "").strip()
    if not key:
        raise ValueError("no_session")
    return key


def _contact(row: dict) -> dict | None:
    jid = str(row.get("jid") or row.get("id") or "").strip()
    if not jid or "@g.us" in jid:
        return None
    phone = jid.split("@", 1)[0]
    name = str(row.get("name") or row.get("notify") or row.get("verifiedName") or "").strip()
    img = str(row.get("imgUrl") or row.get("img_url") or "").strip()
    if not img.startswith("http"):
        img = ""
    return {"jid": jid, "phone": phone, "name": name, "img_url": img}


def _group(row: dict) -> dict | None:
    jid = str(row.get("jid") or row.get("id") or "").strip()
    name = str(row.get("name") or row.get("subject") or "").strip()
    if not jid.endswith("@g.us"):
        return None
    img = str(row.get("imgUrl") or row.get("img_url") or "").strip()
    if not img.startswith("http"):
        img = ""
    return {"jid": jid, "name": name, "img_url": img}


async def load_contacts(channel: AgentChannel) -> list[dict]:
    rows = [_contact(row) for row in await sessions.list_contacts(_session_key(channel))]
    return [row for row in rows if row][:CONTACTS_LIMIT]


async def load_groups(channel: AgentChannel) -> list[dict]:
    rows = [_group(row) for row in await sessions.list_groups(_session_key(channel))]
    return [row for row in rows if row]
