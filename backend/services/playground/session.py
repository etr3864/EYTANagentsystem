import hashlib
import hmac
import os

COOKIE_NAME = "playground_sid"


def _secret() -> bytes:
    key = os.environ.get("JWT_SECRET") or os.environ.get("CREDENTIALS_ENCRYPTION_KEY")
    if not key:
        raise RuntimeError("JWT_SECRET is required to sign playground cookies")
    return key.encode()


def sign(link_id: int, user_id: int) -> str:
    payload = f"{int(link_id)}:{int(user_id)}"
    sig = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    return f"v2.{int(link_id)}.{int(user_id)}.{sig}"


def verify(value: str | None) -> tuple[int, int] | None:
    if not value:
        return None
    parts = value.split(".")
    if len(parts) != 4 or parts[0] != "v2":
        return None
    _, link_s, user_s, sig = parts
    try:
        payload = f"{link_s}:{user_s}"
        expected = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    except RuntimeError:
        return None
    if not hmac.compare_digest(expected, sig):
        return None
    try:
        return int(link_s), int(user_s)
    except ValueError:
        return None
