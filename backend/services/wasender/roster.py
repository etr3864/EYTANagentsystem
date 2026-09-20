from backend.models.agent_channel import AgentChannel
from backend.services.channels.agent_channels import get_credentials
from backend.services.wasender import sessions


def _session_key(channel: AgentChannel) -> str:
    key = str(get_credentials(channel).get("api_key") or "").strip()
    if not key:
        raise ValueError("no_session")
    return key


def _group(row: dict) -> dict | None:
    jid = str(row.get("jid") or row.get("id") or "").strip()
    name = str(row.get("name") or row.get("subject") or "").strip()
    if not jid.endswith("@g.us"):
        return None
    img = str(row.get("imgUrl") or row.get("img_url") or "").strip()
    if not img.startswith("http"):
        img = ""
    return {"jid": jid, "name": name, "img_url": img}


async def load_groups(channel: AgentChannel) -> list[dict]:
    rows = [_group(row) for row in await sessions.list_groups(_session_key(channel))]
    return [row for row in rows if row]
