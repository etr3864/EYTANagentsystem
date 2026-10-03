import asyncio

from backend.models.agent_channel import AgentChannel
from backend.services.channels.agent_channels import get_credentials
from backend.services.wasender import sessions

_NAME_FETCHES = 4


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


def _subject(meta: dict) -> str:
    nested = meta.get("groupMetadata")
    if not isinstance(nested, dict):
        nested = {}
    return str(
        meta.get("subject") or meta.get("name") or nested.get("subject") or nested.get("name") or ""
    ).strip()


async def _fill_missing_names(token: str, rows: list[dict]) -> None:
    """The list often has no name. The title on the phone is metadata.subject."""
    pending = [row for row in rows if not row["name"] or row["name"] == row["jid"]]
    if not pending:
        return
    gate = asyncio.Semaphore(_NAME_FETCHES)

    async def one(row: dict) -> None:
        async with gate:
            subject = _subject(await sessions.get_group(token, row["jid"]))
        if subject and subject != row["jid"]:
            row["name"] = subject

    await asyncio.gather(*(one(row) for row in pending))


async def load_groups(channel: AgentChannel) -> list[dict]:
    token = _session_key(channel)
    rows = [row for row in (_group(item) for item in await sessions.list_groups(token)) if row]
    await _fill_missing_names(token, rows)
    return rows
