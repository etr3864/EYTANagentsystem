"""
Auth API endpoints.
"""
import time
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.logger import log, log_error
from .models import AuthUser, UserRole
from .dependencies import get_current_user, require_role
from .security import (
    create_access_token, 
    create_refresh_token, 
    decode_refresh_token,
    verify_password,
)
from . import service
from .schemas import (
    LoginRequest,
    RefreshRequest,
    CreateAdminRequest,
    CreateEmployeeRequest,
    UpdateUserRequest,
    ChangePasswordRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
    UserWithAgentsResponse,
    AdminListResponse,
    EmployeeListResponse,
    EmployeeWithParentResponse,
    MessageResponse,
)


router = APIRouter(prefix="/auth", tags=["auth"])

# --- Login rate limiting (in-memory, per IP) ---
_MAX_ATTEMPTS = 5
_WINDOW_SECONDS = 300  # 5 minutes
_login_attempts: dict[str, list[float]] = {}


def _check_rate_limit(ip: str) -> None:
    """Raise 429 if too many failed login attempts from this IP."""
    now = time.time()
    attempts = _login_attempts.get(ip, [])
    attempts = [t for t in attempts if now - t < _WINDOW_SECONDS]
    _login_attempts[ip] = attempts

    if len(attempts) >= _MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again in a few minutes."
        )


def _record_failed_attempt(ip: str) -> None:
    _login_attempts.setdefault(ip, []).append(time.time())


def _clear_attempts(ip: str) -> None:
    _login_attempts.pop(ip, None)


# ============================================================
# Public Endpoints
# ============================================================

@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, req: Request, db: Session = Depends(get_db)):
    """Authenticate and get access tokens."""
    client_ip = req.client.host if req.client else "unknown"
    _check_rate_limit(client_ip)

    user = service.authenticate(db, request.email, request.password)
    
    if not user:
        _record_failed_attempt(client_ip)
        log("AUTH_FAIL", email=request.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    _clear_attempts(client_ip)
    log("AUTH_OK", user_id=user.id, role=user.role.value)
    
    return TokenResponse(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id),
        user=UserResponse.model_validate(user)
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_tokens(request: RefreshRequest, db: Session = Depends(get_db)):
    """Refresh access token using refresh token."""
    payload = decode_refresh_token(request.refresh_token)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
    
    user_id = int(payload.get("sub"))
    user = service.get_by_id(db, user_id)
    
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or deactivated"
        )
    
    return TokenResponse(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id),
        user=UserResponse.model_validate(user)
    )


# ============================================================
# Current User Endpoints
# ============================================================

@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: AuthUser = Depends(get_current_user)):
    """Get current user's profile."""
    return UserResponse.model_validate(current_user)


@router.put("/me/password", response_model=MessageResponse)
def change_own_password(
    request: ChangePasswordRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Change own password."""
    if not verify_password(request.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    service.change_password(db, current_user, request.new_password)
    log("PASSWORD_CHANGED", user_id=current_user.id)
    
    return MessageResponse(message="Password changed successfully")


# ============================================================
# Admin Management (Super Admin only)
# ============================================================

@router.get("/admins", response_model=AdminListResponse)
def list_admins(
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """List all admins (clients)."""
    admins = service.list_admins(db)
    
    result = []
    for admin in admins:
        agents = service.get_admin_agents(db, admin.id)
        result.append(UserWithAgentsResponse(
            **UserResponse.model_validate(admin).model_dump(),
            agent_ids=[a.id for a in agents]
        ))
    
    return AdminListResponse(admins=result, total=len(result))


@router.post("/admins", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_admin(
    request: CreateAdminRequest,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """Create a new admin (client)."""
    if service.email_exists(db, request.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    admin = service.create_admin(db, request.email, request.password, request.name)
    log("ADMIN_CREATED", admin_id=admin.id, by=current_user.id)
    
    return UserResponse.model_validate(admin)


@router.get("/admins/{admin_id}", response_model=UserWithAgentsResponse)
def get_admin(
    admin_id: int,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """Get a specific admin by ID."""
    admin = service.get_by_id(db, admin_id)
    
    if not admin or admin.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin not found"
        )
    
    agents = service.get_admin_agents(db, admin.id)
    return UserWithAgentsResponse(
        **UserResponse.model_validate(admin).model_dump(),
        agent_ids=[a.id for a in agents]
    )


@router.put("/admins/{admin_id}", response_model=UserResponse)
def update_admin(
    admin_id: int,
    request: UpdateUserRequest,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """Update an admin's details."""
    admin = service.get_by_id(db, admin_id)
    
    if not admin or admin.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin not found"
        )
    
    admin = service.update_user(db, admin, name=request.name, is_active=request.is_active)
    log("ADMIN_UPDATED", admin_id=admin.id, by=current_user.id)
    
    return UserResponse.model_validate(admin)


@router.put("/admins/{admin_id}/password", response_model=MessageResponse)
def reset_admin_password(
    admin_id: int,
    request: ResetPasswordRequest,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """Reset an admin's password."""
    admin = service.get_by_id(db, admin_id)
    
    if not admin or admin.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin not found"
        )
    
    service.change_password(db, admin, request.new_password)
    log("PASSWORD_RESET", user_id=admin.id, by=current_user.id)
    
    return MessageResponse(message="Password reset successfully")


@router.delete("/admins/{admin_id}", response_model=MessageResponse)
def delete_admin(
    admin_id: int,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """Delete an admin and their employees."""
    admin = service.get_by_id(db, admin_id)
    
    if not admin or admin.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin not found"
        )
    
    try:
        service.delete_user(db, admin)
        log("ADMIN_DELETED", admin_id=admin_id, by=current_user.id)
        return MessageResponse(message="Admin deleted successfully")
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


# ============================================================
# Super Admin Management (Super Admin only)
# ============================================================

@router.get("/super-admins", response_model=list[UserResponse])
def list_super_admins(
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """List all super admins."""
    return [UserResponse.model_validate(u) for u in service.list_super_admins(db)]


@router.post("/super-admins", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_super_admin(
    request: CreateAdminRequest,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """Create a new super admin."""
    if service.email_exists(db, request.email):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Email already registered")

    user = service.create_super_admin(db, request.email, request.password, request.name)
    log("SUPER_ADMIN_CREATED", user_id=user.id, by=current_user.id)
    return UserResponse.model_validate(user)


@router.put("/super-admins/{user_id}/password", response_model=MessageResponse)
def reset_super_admin_password(
    user_id: int,
    request: ResetPasswordRequest,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """Reset a super admin's password."""
    user = service.get_by_id(db, user_id)
    if not user or user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Super admin not found")

    service.change_password(db, user, request.new_password)
    log("PASSWORD_RESET", user_id=user.id, by=current_user.id)
    return MessageResponse(message="Password reset successfully")


@router.delete("/super-admins/{user_id}", response_model=MessageResponse)
def delete_super_admin(
    user_id: int,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """Delete a super admin (cannot delete yourself)."""
    if user_id == current_user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="לא ניתן למחוק את עצמך")

    user = service.get_by_id(db, user_id)
    if not user or user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Super admin not found")

    service.delete_user(db, user)
    log("SUPER_ADMIN_DELETED", user_id=user_id, by=current_user.id)
    return MessageResponse(message="Super admin deleted successfully")


# ============================================================
# Agent Assignment (Super Admin only)
# ============================================================

@router.post("/admins/{admin_id}/agents/{agent_id}", response_model=MessageResponse)
def assign_agent(
    admin_id: int,
    agent_id: int,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """Assign an agent to an admin."""
    admin = service.get_by_id(db, admin_id)
    if not admin or admin.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin not found"
        )
    
    agent = service.assign_agent_to_admin(db, agent_id, admin_id)
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found"
        )
    
    log("AGENT_ASSIGNED", agent_id=agent_id, admin_id=admin_id, by=current_user.id)
    return MessageResponse(message=f"Agent '{agent.name}' assigned to admin")


@router.delete("/admins/{admin_id}/agents/{agent_id}", response_model=MessageResponse)
def unassign_agent(
    admin_id: int,
    agent_id: int,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """Remove agent assignment from an admin."""
    from backend.models.agent import Agent
    
    agent = db.query(Agent).filter(
        Agent.id == agent_id,
        Agent.owner_id == admin_id
    ).first()
    
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found or not assigned to this admin"
        )
    
    service.unassign_agent(db, agent_id)
    log("AGENT_UNASSIGNED", agent_id=agent_id, admin_id=admin_id, by=current_user.id)
    
    return MessageResponse(message=f"Agent '{agent.name}' unassigned")


@router.get("/agents/unassigned")
def list_unassigned_agents(
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN)),
    db: Session = Depends(get_db)
):
    """List agents without an owner."""
    agents = service.get_unassigned_agents(db)
    return [{
        "id": a.id,
        "name": a.name,
        "phone_number_id": a.phone_number_id,
        "is_active": a.is_active,
    } for a in agents]


# ============================================================
# Employee Management (Admin only)
# ============================================================

@router.get("/employees", response_model=EmployeeListResponse)
def list_employees(
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    """List employees (admin sees their own, super admin sees all)."""
    if current_user.role == UserRole.SUPER_ADMIN:
        # Super admin sees all employees with parent name
        employees = db.query(AuthUser).filter(
            AuthUser.role == UserRole.EMPLOYEE
        ).all()
        
        employee_responses = []
        for e in employees:
            resp = EmployeeWithParentResponse.model_validate(e)
            # Add parent name
            if e.parent:
                resp.parent_name = e.parent.name
            employee_responses.append(resp)
    else:
        employees = service.list_employees(db, current_user.id)
        employee_responses = [EmployeeWithParentResponse.model_validate(e) for e in employees]
    
    return EmployeeListResponse(
        employees=employee_responses,
        total=len(employee_responses)
    )


@router.post("/employees", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_employee(
    request: CreateEmployeeRequest,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    """Create a new employee under the current admin/super admin."""
    if service.email_exists(db, request.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    employee = service.create_employee(
        db, current_user, request.email, request.password, request.name
    )
    log("EMPLOYEE_CREATED", employee_id=employee.id, admin_id=current_user.id)
    
    return UserResponse.model_validate(employee)


@router.get("/employees/{employee_id}", response_model=UserResponse)
def get_employee(
    employee_id: int,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    """Get a specific employee."""
    employee = service.get_by_id(db, employee_id)
    
    if not employee or employee.role != UserRole.EMPLOYEE:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )
    
    if not service.can_manage_employee(current_user, employee):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this employee"
        )
    
    return UserResponse.model_validate(employee)


@router.put("/employees/{employee_id}", response_model=UserResponse)
def update_employee(
    employee_id: int,
    request: UpdateUserRequest,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    """Update an employee's details."""
    employee = service.get_by_id(db, employee_id)
    
    if not employee or employee.role != UserRole.EMPLOYEE:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )
    
    if not service.can_manage_employee(current_user, employee):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this employee"
        )
    
    employee = service.update_user(db, employee, name=request.name, is_active=request.is_active)
    log("EMPLOYEE_UPDATED", employee_id=employee.id, by=current_user.id)
    
    return UserResponse.model_validate(employee)


@router.put("/employees/{employee_id}/password", response_model=MessageResponse)
def reset_employee_password(
    employee_id: int,
    request: ResetPasswordRequest,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    """Reset an employee's password."""
    employee = service.get_by_id(db, employee_id)
    
    if not employee or employee.role != UserRole.EMPLOYEE:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )
    
    if not service.can_manage_employee(current_user, employee):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this employee"
        )
    
    service.change_password(db, employee, request.new_password)
    log("PASSWORD_RESET", user_id=employee.id, by=current_user.id)
    
    return MessageResponse(message="Password reset successfully")


@router.delete("/employees/{employee_id}", response_model=MessageResponse)
def delete_employee(
    employee_id: int,
    current_user: AuthUser = Depends(require_role(UserRole.SUPER_ADMIN, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    """Delete an employee."""
    employee = service.get_by_id(db, employee_id)
    
    if not employee or employee.role != UserRole.EMPLOYEE:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found"
        )
    
    if not service.can_manage_employee(current_user, employee):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have access to this employee"
        )
    
    service.delete_user(db, employee)
    log("EMPLOYEE_DELETED", employee_id=employee_id, by=current_user.id)
    
    return MessageResponse(message="Employee deleted successfully")
