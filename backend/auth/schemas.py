"""
Pydantic schemas for auth requests/responses.
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from .models import UserRole


# ============================================================
# Request Schemas
# ============================================================

class LoginRequest(BaseModel):
    """Login credentials."""
    email: EmailStr
    password: str = Field(min_length=6)


class RefreshRequest(BaseModel):
    """Token refresh request."""
    refresh_token: str


class CreateAdminRequest(BaseModel):
    """Create a new admin (client)."""
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = Field(min_length=2, max_length=100)


class CreateEmployeeRequest(BaseModel):
    """Create a new employee under an admin."""
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = Field(min_length=2, max_length=100)


class UpdateUserRequest(BaseModel):
    """Update user details."""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    is_active: Optional[bool] = None


class ChangePasswordRequest(BaseModel):
    """Change own password."""
    current_password: str
    new_password: str = Field(min_length=8)


class ResetPasswordRequest(BaseModel):
    """Reset password (super admin only)."""
    new_password: str = Field(min_length=8)


# ============================================================
# Response Schemas
# ============================================================

class UserResponse(BaseModel):
    """User info response."""
    id: int
    email: str
    name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    parent_id: Optional[int] = None
    
    class Config:
        from_attributes = True


class UserWithAgentsResponse(UserResponse):
    """User info with assigned agents."""
    agent_ids: list[int] = []


class TokenResponse(BaseModel):
    """Authentication tokens."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class AdminListResponse(BaseModel):
    """List of admins."""
    admins: list[UserWithAgentsResponse]
    total: int


class EmployeeWithParentResponse(UserResponse):
    """Employee with parent admin info."""
    parent_name: Optional[str] = None


class EmployeeListResponse(BaseModel):
    """List of employees."""
    employees: list[EmployeeWithParentResponse]
    total: int


class MessageResponse(BaseModel):
    """Generic message response."""
    message: str
    success: bool = True
