from sqlalchemy.orm import Session

from backend.core.encryption import decrypt_credentials, encrypt_credentials
from backend.models.system_secret import SystemSecret

PAT_NAME = "wasender_pat"


def get_pat(db: Session) -> str | None:
    row = db.get(SystemSecret, PAT_NAME)
    if not row:
        return None
    data = decrypt_credentials(row.value_encrypted)
    token = (data.get("pat") or "").strip()
    return token or None


def pat_configured(db: Session) -> bool:
    return get_pat(db) is not None


def set_pat(db: Session, raw: str) -> None:
    token = (raw or "").strip()
    if not token:
        raise ValueError("empty_pat")
    blob = encrypt_credentials({"pat": token})
    row = db.get(SystemSecret, PAT_NAME)
    if row:
        row.value_encrypted = blob
    else:
        db.add(SystemSecret(name=PAT_NAME, value_encrypted=blob))
    db.commit()


def clear_pat(db: Session) -> None:
    row = db.get(SystemSecret, PAT_NAME)
    if row:
        db.delete(row)
        db.commit()
