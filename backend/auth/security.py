"""
Security utilities - password hashing and JWT tokens.
"""
from datetime import datetime, timedelta
from typing import Optional
import bcrypt
import jwt
from backend.core.config import settings


# ============================================================
# Password Hashing
# ============================================================

def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode(), salt).decode()


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(password.encode(), password_hash.encode())


# ============================================================
# JWT Tokens
# ============================================================

def create_access_token(user_id: int, role: str) -> str:
    """Create a short-lived access token (1 hour)."""
    expires = datetime.utcnow() + timedelta(minutes=settings.jwt_access_expire_minutes)
    payload = {
        "sub": str(user_id),
        "role": role,
        "type": "access",
        "exp": expires,
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: int) -> str:
    """Create a long-lived refresh token (7 days)."""
    expires = datetime.utcnow() + timedelta(days=settings.jwt_refresh_expire_days)
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "exp": expires,
        "iat": datetime.utcnow(),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token.
    
    Returns the payload if valid, None otherwise.
    """
    try:
        payload = jwt.decode(
            token, 
            settings.jwt_secret, 
            algorithms=[settings.jwt_algorithm]
        )
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def decode_access_token(token: str) -> Optional[dict]:
    """Decode an access token specifically.
    
    Returns payload only if it's a valid access token.
    """
    payload = decode_token(token)
    if payload and payload.get("type") == "access":
        return payload
    return None


def decode_refresh_token(token: str) -> Optional[dict]:
    """Decode a refresh token specifically.
    
    Returns payload only if it's a valid refresh token.
    """
    payload = decode_token(token)
    if payload and payload.get("type") == "refresh":
        return payload
    return None
