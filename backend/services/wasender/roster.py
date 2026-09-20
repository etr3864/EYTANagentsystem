from backend.models.agent_channel import AgentChannel
from backend.services.channels.agent_channels import get_credentials
from backend.services.wasender import sessions

CONTACTS_LIMIT = 50


def _contact(row: dict) -> dict | None:
    jid = str(row.get("jid") or row.get("id") or "").strip()
    name = str(row.get("name") or row.get("notify") or row.get("verifiedName") or "").strip()
    if not jid or "@g.us" in jid:
        return None
    return {"jid": jid, "name": name}


def _group(row: dict) -> dict | None:
    jid = str(row.get("jid") or row.get("id") or "").strip()
    name = str(row.get("name") or row.get("subject") or "").strip()
    if not jid.endswith("@g.us"):
        return None
    return {"jid": jid, "name": name}


async def load_roster(channel: AgentChannel) -> dict:
    creds = get_credentials(channel)
    key = str(creds.get("api_key") or "").strip()
    if not key:
        raise ValueError("no_session")
    contacts = [_contact(row) for row in await sessions.list_contacts(key)]
    groups = [_group(row) for row in await sessions.list_groups(key)]
    return {
        "contacts": [row for row in contacts if row][:CONTACTS_LIMIT],
        "groups": [row for row in groups if row],
    }
