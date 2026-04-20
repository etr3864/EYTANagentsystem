"""HMAC SHA-256 verification for Meta webhooks.

Meta signs every webhook POST with:
    X-Hub-Signature-256: sha256=<hex_digest>

Different Meta products use different App Secrets:
    - Messenger / WhatsApp: Facebook App Secret  (META_APP_SECRET)
    - Instagram Login:      Instagram App Secret  (META_INSTAGRAM_APP_SECRET)
"""
import hashlib
import hmac


def verify_meta_signature(payload: bytes, signature: str, secret: str) -> bool:
    """Verify Meta webhook X-Hub-Signature-256 against a specific secret."""
    if not signature or not secret:
        return False

    expected = "sha256=" + hmac.new(
        secret.strip().encode("utf-8"),
        payload,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


def select_secret_for_object(obj: str, app_secret: str | None,
                              instagram_app_secret: str | None) -> str | None:
    """Pick the correct signing secret based on the webhook object type.

    Instagram Login webhooks (object="instagram") are signed with the
    Instagram App Secret. Everything else uses the main Facebook App Secret.
    """
    if obj == "instagram" and instagram_app_secret:
        return instagram_app_secret
    return app_secret
