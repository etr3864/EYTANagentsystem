"""HMAC SHA-256 verification for Meta webhooks.

Meta signs every webhook POST with:
    X-Hub-Signature-256: sha256=<hex_digest>

The digest is computed over the raw request body using the App Secret as key.
"""
import hashlib
import hmac


def verify_meta_signature(payload: bytes, signature: str, app_secret: str) -> bool:
    """Verify Meta webhook X-Hub-Signature-256 header.

    Args:
        payload: Raw request body bytes (before any parsing).
        signature: Value of X-Hub-Signature-256 header (e.g. "sha256=abc123...").
        app_secret: Meta App Secret from developer console.

    Returns:
        True if signature is valid, False otherwise.
    """
    if not signature or not app_secret:
        return False

    expected = "sha256=" + hmac.new(
        app_secret.encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)
