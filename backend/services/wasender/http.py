from typing import Any

import httpx

from backend.core.logger import log_error

BASE_URL = "https://www.wasenderapi.com/api"
_http: httpx.AsyncClient | None = None


class SessionApiError(Exception):
    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(message)

    def client_message(self) -> str:
        text = (self.message or "").lower()
        if "personal access token" in text or self.message == "wasender_pat_missing":
            return "אין PAT תקף. שמור מפתח בהגדרות."
        if self.message == "no_session":
            return "אין סשן חי. צור סשן חדש."
        return self.message


def _client() -> httpx.AsyncClient:
    global _http
    if _http is None or _http.is_closed:
        _http = httpx.AsyncClient()
    return _http


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _message(payload: Any, fallback: str) -> str:
    if isinstance(payload, dict):
        err = payload.get("message") or payload.get("error") or payload.get("msg")
        if isinstance(err, str) and err.strip():
            return err.strip()[:200]
    return fallback


async def request(
    method: str,
    path: str,
    token: str,
    *,
    json: dict | None = None,
    timeout: float = 30,
) -> Any:
    url = f"{BASE_URL}{path}"
    try:
        response = await _client().request(
            method,
            url,
            headers=_headers(token),
            json=json,
            timeout=timeout,
        )
    except Exception as error:
        log_error("wasender_session", str(error)[:80])
        raise SessionApiError(502, "wasender_unreachable") from error

    body: Any
    try:
        body = response.json()
    except Exception:
        body = {}

    if response.status_code >= 400:
        raise SessionApiError(
            response.status_code,
            _message(body, f"wasender_{response.status_code}"),
        )

    if isinstance(body, dict) and body.get("success") is False:
        raise SessionApiError(400, _message(body, "wasender_failed"))
    return body
