"""Signed JWT state parameter for OAuth CSRF protection.

Used in Meta OAuth flow to prevent CSRF attacks where an attacker
tricks a super-admin into connecting their Meta account to a wrong agent.

The state token is:
- Signed with jwt_secret
- Expires in 10 minutes
- Contains agent_id + channel_type
"""
from datetime import datetime, timedelta

import jwt
from jwt import PyJWTError

from backend.core.config import settings


_STATE_EXPIRE_MINUTES = 10
_ALGORITHM = "HS256"


def create_oauth_state(agent_id: int, channel_type: str) -> str:
    """Create a signed JWT state parameter for OAuth flow.

    Args:
        agent_id: The agent this OAuth is being connected to.
        channel_type: e.g. "instagram", "messenger", "whatsapp_meta".

    Returns:
        Signed JWT string to use as OAuth state parameter.
    """
    payload = {
        "agent_id": agent_id,
        "channel_type": channel_type,
        "exp": datetime.utcnow() + timedelta(minutes=_STATE_EXPIRE_MINUTES),
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=_ALGORITHM)


def verify_oauth_state(state: str) -> dict:
    """Verify and decode OAuth state JWT.

    Args:
        state: JWT string from OAuth callback.

    Returns:
        Decoded payload dict with agent_id and channel_type.

    Raises:
        ValueError: If state is invalid, expired, or tampered with.
    """
    try:
        payload = jwt.decode(state, settings.jwt_secret, algorithms=[_ALGORITHM])
        if "agent_id" not in payload or "channel_type" not in payload:
            raise ValueError("Missing required fields in OAuth state")
        return payload
    except PyJWTError as e:
        raise ValueError(f"Invalid OAuth state: {e}") from e
