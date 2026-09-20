from typing import Any
from urllib.parse import quote

from backend.services.wasender.http import SessionApiError, request


def _data(body: Any) -> Any:
    if isinstance(body, dict) and "data" in body:
        return body["data"]
    return body


async def list_sessions(pat: str) -> list[dict]:
    data = _data(await request("GET", "/whatsapp-sessions", pat))
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    return []


async def create_session(pat: str, payload: dict) -> dict:
    data = _data(await request("POST", "/whatsapp-sessions", pat, json=payload))
    if not isinstance(data, dict):
        raise ValueError("bad_create_response")
    return data


async def get_session(pat: str, session_id: int) -> dict:
    data = _data(await request("GET", f"/whatsapp-sessions/{session_id}", pat))
    return data if isinstance(data, dict) else {}


async def update_session(pat: str, session_id: int, payload: dict) -> dict:
    data = _data(await request("PUT", f"/whatsapp-sessions/{session_id}", pat, json=payload))
    return data if isinstance(data, dict) else {}


async def delete_session(pat: str, session_id: int) -> None:
    await request("DELETE", f"/whatsapp-sessions/{session_id}", pat)


async def connect_session(token: str, session_id: int) -> dict:
    data = _data(await request("POST", f"/whatsapp-sessions/{session_id}/connect", token))
    return data if isinstance(data, dict) else {}


async def disconnect_session(token: str, session_id: int) -> None:
    await request("POST", f"/whatsapp-sessions/{session_id}/disconnect", token)


async def get_qr(token: str, session_id: int) -> str | None:
    data = _data(await request("GET", f"/whatsapp-sessions/{session_id}/qrcode", token))
    if not isinstance(data, dict):
        return None
    return data.get("qrCode") or data.get("qrcode") or data.get("qr") or None


def _rows(data: Any) -> list[dict]:
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        items = data.get("items") or data.get("contacts") or data.get("groups")
        if isinstance(items, list):
            return [row for row in items if isinstance(row, dict)]
    return []


async def list_groups(token: str) -> list[dict]:
    return _rows(_data(await request("GET", "/groups", token, timeout=20)))


def _enc(jid: str) -> str:
    # Wasender wants @ as %40 in path JIDs. Digits-only phones are unchanged.
    return quote(jid, safe="")


def _entity(raw: Any) -> dict:
    if isinstance(raw, list):
        raw = raw[0] if raw and isinstance(raw[0], dict) else {}
    if not isinstance(raw, dict):
        return {}
    for key in ("contact", "group"):
        inner = raw.get(key)
        if isinstance(inner, dict):
            return inner
    return raw


async def get_contact(token: str, phone: str) -> dict:
    ident = (phone or "").split("@", 1)[0]
    paths = [f"/contacts/{_enc(ident)}"]
    if ident:
        paths.append(f"/contacts/{_enc(f'{ident}@s.whatsapp.net')}")
    for path in paths:
        try:
            row = _entity(_data(await request("GET", path, token, timeout=15)))
        except SessionApiError:
            continue
        if row:
            return row
    return {}


async def get_group(token: str, jid: str) -> dict:
    try:
        return _entity(_data(await request(
            "GET", f"/groups/{_enc(jid)}/metadata", token, timeout=15,
        )))
    except SessionApiError:
        return {}


async def get_picture(token: str, target: str, *, group: bool = False) -> str | None:
    path = f"/groups/{_enc(target)}/picture" if group else f"/contacts/{_enc(target)}/picture"
    data = _data(await request("GET", path, token, timeout=15))
    if isinstance(data, dict):
        url = str(data.get("imgUrl") or data.get("img_url") or "").strip()
        if url.startswith("http"):
            return url
    return None


async def get_status(token: str, session_id: int | None = None) -> dict:
    path = "/status"
    if session_id is not None:
        path = f"{path}?sessionId={session_id}"
    data = _data(await request("GET", path, token, timeout=15))
    return data if isinstance(data, dict) else {}
