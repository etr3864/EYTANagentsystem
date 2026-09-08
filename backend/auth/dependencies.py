"""
FastAPI dependencies for authentication and authorization.
"""
from typing import Callable
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from backend.core.database import get_db
from .models import AuthUser, UserRole
from .security import decode_access_token
from . import service
from . import mcp_tokens


# Bearer token extractor
security = HTTPBearer(auto_error=False)


def _user_from_bearer(db: Session, raw: str | None) -> AuthUser | None:
    if not raw:
        return None
    if raw.startswith(mcp_tokens.TOKEN_PREFIX):
        return mcp_tokens.authenticate(db, raw)
    payload = decode_access_token(raw)
    if not payload:
        return None
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        return None
    user = service.get_by_id(db, user_id)
    if not user or not user.is_active:
        return None
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> AuthUser:
    """JWT session or long-lived MCP personal token."""
    raw = credentials.credentials if credentials else None
    user = _user_from_bearer(db, raw)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> AuthUser | None:
    raw = credentials.credentials if credentials else None
    return _user_from_bearer(db, raw)


def require_role(*allowed_roles: UserRole) -> Callable:
    """Create a dependency that requires specific roles.
    
    Usage:
        @router.get("/admins")
        def list_admins(
            user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN))
        ):
            ...
    """
    async def role_checker(
        current_user: AuthUser = Depends(get_current_user)
    ) -> AuthUser:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role: {', '.join(r.value for r in allowed_roles)}"
            )
        return current_user
    
    return role_checker


def require_super_admin() -> Callable:
    """Shortcut for requiring super admin role."""
    return require_role(UserRole.SUPER_ADMIN)


def require_admin_or_above() -> Callable:
    """Shortcut for requiring admin or super admin role."""
    return require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)


def require_agent_access(agent_id_param: str = "agent_id") -> Callable:
    """Create a dependency that checks agent access.
    
    Usage:
        @router.get("/agents/{agent_id}")
        def get_agent(
            agent_id: int,
            user: AuthUser = Depends(require_agent_access("agent_id"))
        ):
            ...
    """
    async def agent_access_checker(
        current_user: AuthUser = Depends(get_current_user),
        db: Session = Depends(get_db),
        **kwargs
    ) -> AuthUser:
        # Get agent_id from path params
        agent_id = kwargs.get(agent_id_param)
        if agent_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Agent ID not provided"
            )
        
        if not service.can_access_agent(db, current_user, agent_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this agent"
            )
        
        return current_user
    
    return agent_access_checker


class AgentAccessChecker:
    """Dependency class for checking agent access.
    
    Usage:
        @router.get("/agents/{agent_id}")
        def get_agent(
            agent_id: int,
            user: AuthUser = Depends(AgentAccessChecker())
        ):
            ...
    """
    async def __call__(
        self,
        agent_id: int,
        current_user: AuthUser = Depends(get_current_user),
        db: Session = Depends(get_db)
    ) -> AuthUser:
        if not service.can_access_agent(db, current_user, agent_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have access to this agent"
            )
        return current_user
