"""
Auth models - system users (not WhatsApp contacts).
"""
import enum
from datetime import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.dialects.postgresql import ENUM as PgEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from backend.core.database import Base

if TYPE_CHECKING:
    from backend.models.agent import Agent


class UserRole(str, enum.Enum):
    """User roles with hierarchical permissions."""
    SUPER_ADMIN = "super_admin"  # Full system access, can create admins
    ADMIN = "admin"              # Business owner, can create employees
    EMPLOYEE = "employee"        # Limited access under an admin


class AuthUser(Base):
    """
    System users for authentication.
    Separate from WhatsApp contacts (models/user.py).
    """
    __tablename__ = "auth_users"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(100))
    role: Mapped[UserRole] = mapped_column(
        PgEnum(UserRole, name='userrole', create_type=False),
        default=UserRole.EMPLOYEE
    )
    
    # Employee -> Admin relationship (null for super_admin and admin)
    parent_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("auth_users.id", ondelete="CASCADE"),
        nullable=True
    )
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    
    # Self-referential relationship for employees
    parent: Mapped[Optional["AuthUser"]] = relationship(
        "AuthUser",
        remote_side="AuthUser.id",
        back_populates="employees"
    )
    employees: Mapped[list["AuthUser"]] = relationship(
        "AuthUser",
        back_populates="parent",
        cascade="all, delete-orphan"
    )
    
    # Agents owned by this admin (backref from Agent.owner)
    agents: Mapped[list["Agent"]] = relationship(
        "Agent",
        back_populates="owner",
        foreign_keys="Agent.owner_id"
    )
    
    # Index for faster employee lookups
    __table_args__ = (
        Index("ix_auth_users_parent_id", "parent_id"),
    )
    
    def is_super_admin(self) -> bool:
        return self.role == UserRole.SUPER_ADMIN
    
    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN
    
    def is_employee(self) -> bool:
        return self.role == UserRole.EMPLOYEE
    
    def get_admin_id(self) -> int:
        """Get the admin ID for permission checks.
        
        - Super Admin: returns own ID (has access to all)
        - Admin: returns own ID
        - Employee: returns parent_id (their admin)
        """
        if self.role == UserRole.EMPLOYEE:
            return self.parent_id
        return self.id
