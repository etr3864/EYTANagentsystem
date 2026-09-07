from backend.core.encryption import decrypt_credentials, encrypt_credentials


def encrypt_headers(headers: dict[str, str]) -> bytes | None:
    cleaned = {k.strip(): v for k, v in (headers or {}).items() if k and k.strip()}
    if not cleaned:
        return None
    return encrypt_credentials(cleaned)


def decrypt_headers(blob: bytes | None) -> dict[str, str]:
    if not blob:
        return {}
    data = decrypt_credentials(blob)
    return {str(k): str(v) for k, v in data.items()}


def mask_headers(headers: dict[str, str]) -> dict[str, str]:
    masked = {}
    for key, value in headers.items():
        if len(value) < 8:
            masked[key] = "***"
        else:
            masked[key] = f"...{value[-4:]}"
    return masked
