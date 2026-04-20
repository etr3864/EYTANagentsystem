"""Fernet symmetric encryption for channel credentials.

All channel credentials (tokens, API keys, webhook secrets) are stored
encrypted in the database. The encryption key lives in CREDENTIALS_ENCRYPTION_KEY
env var and must be backed up separately from the database.

Generate a new key:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

WARNING: Losing the key makes ALL stored credentials unreadable.
"""
import json
import os
from typing import Optional

from backend.core.config import settings


_fernet = None


def _get_fernet():
    """Lazy-init Fernet instance."""
    global _fernet
    if _fernet is None:
        key = settings.credentials_encryption_key
        if not key:
            raise RuntimeError(
                "CREDENTIALS_ENCRYPTION_KEY is not set. "
                "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        from cryptography.fernet import Fernet
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
    return _fernet


def encrypt_credentials(data: dict) -> bytes:
    """Encrypt a credentials dict to bytes for storage."""
    return _get_fernet().encrypt(json.dumps(data).encode())


def decrypt_credentials(encrypted: bytes) -> dict:
    """Decrypt stored bytes back to credentials dict."""
    return json.loads(_get_fernet().decrypt(encrypted))


def credentials_available() -> bool:
    """Check if encryption is configured (non-raising)."""
    return bool(settings.credentials_encryption_key)
