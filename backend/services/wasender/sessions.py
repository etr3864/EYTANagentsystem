from typing import Any

from backend.services.wasender.http import request


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


async def get_status(token: str, session_id: int | None = None) -> dict:
    path = "/status"
    if session_id is not None:
        path = f"{path}?sessionId={session_id}"
    data = _data(await request("GET", path, token, timeout=15))
    return data if isinstance(data, dict) else {}
