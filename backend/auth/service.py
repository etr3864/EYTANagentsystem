"""
Auth service - business logic for user management.
"""
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from .models import AuthUser, UserRole
from .security import hash_password, verify_password
from backend.models.agent import Agent


# ============================================================
# Authentication
# ============================================================

def authenticate(db: Session, email: str, password: str) -> Optional[AuthUser]:
    """Authenticate user by email and password.
    
    Returns the user if credentials are valid and user is active, None otherwise.
    """
    user = get_by_email(db, email)
    if not user:
        return None
    if not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


# ============================================================
# User CRUD
# ============================================================

def get_by_id(db: Session, user_id: int) -> Optional[AuthUser]:
    """Get user by ID."""
    return db.query(AuthUser).filter(AuthUser.id == user_id).first()


def get_by_email(db: Session, email: str) -> Optional[AuthUser]:
    """Get user by email (case-insensitive)."""
    return db.query(AuthUser).filter(
        func.lower(AuthUser.email) == email.lower()
    ).first()


def email_exists(db: Session, email: str) -> bool:
    """Check if email is already registered."""
    return get_by_email(db, email) is not None


def create_super_admin(db: Session, email: str, password: str, name: str) -> AuthUser:
    """Create a super admin user.
    
    Should only be used for initial setup or migration.
    """
    user = AuthUser(
        email=email.lower(),
        password_hash=hash_password(password),
        name=name,
        role=UserRole.SUPER_ADMIN,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_admin(db: Session, email: str, password: str, name: str) -> AuthUser:
    """Create an admin (client/business owner)."""
    user = AuthUser(
        email=email.lower(),
        password_hash=hash_password(password),
        name=name,
        role=UserRole.ADMIN,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_employee(
    db: Session, 
    admin: AuthUser, 
    email: str, 
    password: str, 
    name: str
) -> AuthUser:
    """Create an employee under an admin."""
    user = AuthUser(
        email=email.lower(),
        password_hash=hash_password(password),
        name=name,
        role=UserRole.EMPLOYEE,
        parent_id=admin.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(
    db: Session, 
    user: AuthUser, 
    name: Optional[str] = None,
    is_active: Optional[bool] = None
) -> AuthUser:
    """Update user details."""
    if name is not None:
        user.name = name
    if is_active is not None:
        user.is_active = is_active
    db.commit()
    db.refresh(user)
    return user


def change_password(db: Session, user: AuthUser, new_password: str) -> AuthUser:
    """Change user's password."""
    user.password_hash = hash_password(new_password)
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user: AuthUser) -> bool:
    """Delete a user.
    
    - Admin with agents: blocked (must transfer/delete agents first)
    - Admin with employees: cascade deletes employees
    - Employee: direct delete
    
    Returns True if deleted, raises exception otherwise.
    """
    # Check if admin has agents
    if user.role == UserRole.ADMIN:
        agent_count = db.query(Agent).filter(Agent.owner_id == user.id).count()
        if agent_count > 0:
            raise ValueError(
                f"Cannot delete admin with {agent_count} assigned agents. "
                "Transfer or delete agents first."
            )
    
    # Employees are cascaded automatically via relationship
    db.delete(user)
    db.commit()
    return True


# ============================================================
# Listing Users
# ============================================================

def list_admins(db: Session) -> list[AuthUser]:
    """List all admins."""
    return db.query(AuthUser).filter(
        AuthUser.role == UserRole.ADMIN
    ).order_by(AuthUser.created_at.desc()).all()


def list_super_admins(db: Session) -> list[AuthUser]:
    """List all super admins."""
    return db.query(AuthUser).filter(
        AuthUser.role == UserRole.SUPER_ADMIN
    ).order_by(AuthUser.created_at.desc()).all()


def list_employees(db: Session, admin_id: int) -> list[AuthUser]:
    """List all employees under a specific admin."""
    return db.query(AuthUser).filter(
        AuthUser.role == UserRole.EMPLOYEE,
        AuthUser.parent_id == admin_id
    ).order_by(AuthUser.created_at.desc()).all()


def count_employees(db: Session, admin_id: int) -> int:
    """Count employees under an admin."""
    return db.query(AuthUser).filter(
        AuthUser.role == UserRole.EMPLOYEE,
        AuthUser.parent_id == admin_id
    ).count()


# ============================================================
# Agent Assignment
# ============================================================

def assign_agent_to_admin(db: Session, agent_id: int, admin_id: int) -> Optional[Agent]:
    """Assign an agent to an admin.
    
    Returns the updated agent or None if not found.
    """
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        return None
    
    agent.owner_id = admin_id
    db.commit()
    db.refresh(agent)
    return agent


def unassign_agent(db: Session, agent_id: int) -> Optional[Agent]:
    """Remove agent ownership (make unassigned).
    
    Returns the updated agent or None if not found.
    """
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        return None
    
    agent.owner_id = None
    db.commit()
    db.refresh(agent)
    return agent


def get_admin_agents(db: Session, admin_id: int) -> list[Agent]:
    """Get all agents owned by an admin."""
    return db.query(Agent).filter(Agent.owner_id == admin_id).all()


def get_unassigned_agents(db: Session) -> list[Agent]:
    """Get all agents without an owner."""
    return db.query(Agent).filter(Agent.owner_id == None).all()


# ============================================================
# Permission Checks
# ============================================================

def can_access_agent(db: Session, user: AuthUser, agent_id: int) -> bool:
    """Check if user can access a specific agent.
    
    - Super Admin: access to all agents
    - Admin: access to owned agents only
    - Employee: access to agents owned by their admin
    """
    if user.role == UserRole.SUPER_ADMIN:
        return True
    
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        return False
    
    admin_id = user.get_admin_id()
    return agent.owner_id == admin_id


def can_manage_employee(user: AuthUser, employee: AuthUser) -> bool:
    """Check if user can manage an employee.
    
    - Super Admin: can manage all employees
    - Admin: can only manage their own employees
    """
    if user.role == UserRole.SUPER_ADMIN:
        return True
    
    if user.role == UserRole.ADMIN:
        return employee.parent_id == user.id
    
    return False


def get_accessible_agents(db: Session, user: AuthUser) -> list[Agent]:
    """Get all agents accessible to a user.
    
    - Super Admin: all agents
    - Admin: owned agents
    - Employee: agents owned by their admin
    """
    if user.role == UserRole.SUPER_ADMIN:
        return db.query(Agent).all()
    
    admin_id = user.get_admin_id()
    return db.query(Agent).filter(Agent.owner_id == admin_id).all()


def can_access_conversation(db: Session, user: AuthUser, conversation_id: int) -> bool:
    """Check if user can access a specific conversation.
    
    Conversation access is based on agent access.
    """
    from backend.models.conversation import Conversation
    
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        return False
    
    return can_access_agent(db, user, conv.agent_id)
