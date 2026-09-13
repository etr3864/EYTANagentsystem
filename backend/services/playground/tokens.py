import hashlib
import secrets

from backend.core.encryption import decrypt_credentials, encrypt_credentials
from backend.services.playground.constants import TOKEN_PREFIX


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def issue_raw() -> str:
    return TOKEN_PREFIX + secrets.token_urlsafe(32)


def encrypt_token(raw: str) -> bytes:
    return encrypt_credentials({"t": raw})


def decrypt_token(blob: bytes) -> str:
    data = decrypt_credentials(blob)
    return str(data["t"])
