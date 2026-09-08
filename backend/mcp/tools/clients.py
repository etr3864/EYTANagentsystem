from __future__ import annotations

from typing import Optional

from backend.auth import service as auth_service
from backend.auth.models import AuthUser, UserRole
from backend.core.logger import log
from backend.mcp.ctx import current_user, db_session, fail, require_admin, require_super
from backend.models.agent import Agent


def register(mcp) -> None:
    _clients(mcp)
    _employees(mcp)


def _clients(mcp) -> None:
    @mcp.tool()
    def list_clients() -> list[dict]:
        """List client accounts (admins). Super-admin only. No passwords."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            return [_client_public(db, admin) for admin in auth_service.list_admins(db)]

    @mcp.tool()
    def get_client(client_id: int) -> dict:
        """Get a client account and their assigned agent ids. Super-admin only."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            return _client_public(db, _client(db, client_id))

    @mcp.tool()
    def create_client(
        name: str,
        email: str,
        password: str,
        agent_id: Optional[int] = None,
    ) -> dict:
        """Create a client (dashboard login). Super-admin only. Optionally assign an agent.
        Does not create super-admins. Password is not returned."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            name, email = _login_fields(db, name, email, password)
            if agent_id is not None and not db.get(Agent, agent_id):
                raise fail("סוכן לא נמצא")
            admin = auth_service.create_admin(db, email, password, name)
            if agent_id is not None:
                auth_service.assign_agent_to_admin(db, agent_id, admin.id)
            log("ADMIN_CREATED", admin_id=admin.id, by=user.id)
            return _client_public(db, admin)

    @mcp.tool()
    def set_client_password(client_id: int, new_password: str, confirm: bool = False) -> dict:
        """Reset a client's dashboard password. Super-admin only. Requires confirm=true."""
        _require_password_confirm(confirm, "לקוח", new_password)
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            admin = _client(db, client_id)
            auth_service.change_password(db, admin, new_password)
            log("PASSWORD_RESET", user_id=admin.id, by=user.id)
            return {"status": "password_set", "id": admin.id, "email": admin.email}

    @mcp.tool()
    def assign_agent_to_client(client_id: int, agent_id: int) -> dict:
        """Assign an agent to a client. Super-admin only. Replaces previous owner of that agent."""
        with db_session() as db:
            user = current_user(db)
            require_super(user)
            _client(db, client_id)
            agent = auth_service.assign_agent_to_admin(db, agent_id, client_id)
            if not agent:
                raise fail("סוכן לא נמצא")
            log("AGENT_ASSIGNED", agent_id=agent_id, admin_id=client_id, by=user.id)
            return {"status": "assigned", "agent_id": agent.id, "agent_name": agent.name, "client_id": client_id}


def _employees(mcp) -> None:
    @mcp.tool()
    def list_employees(client_id: Optional[int] = None) -> list[dict]:
        """List employees. Admin sees their own. Super-admin sees all, or filter by client_id."""
        with db_session() as db:
            user = current_user(db)
            require_admin(user)
            if user.role == UserRole.ADMIN:
                rows = auth_service.list_employees(db, user.id)
            elif client_id is not None:
                _client(db, client_id)
                rows = auth_service.list_employees(db, client_id)
            else:
                rows = (
                    db.query(AuthUser)
                    .filter(AuthUser.role == UserRole.EMPLOYEE)
                    .order_by(AuthUser.id.desc())
                    .all()
                )
            return [_employee_public(db, row) for row in rows]

    @mcp.tool()
    def get_employee(employee_id: int) -> dict:
        """Get an employee. Admin can only read their own staff."""
        with db_session() as db:
            user = current_user(db)
            require_admin(user)
            return _employee_public(db, _managed_employee(db, user, employee_id))

    @mcp.tool()
    def create_employee(
        name: str,
        email: str,
        password: str,
        client_id: Optional[int] = None,
    ) -> dict:
        """Create an employee under a client. Super-admin must pass client_id.
        Admin creates under themselves. Password is not returned."""
        with db_session() as db:
            user = current_user(db)
            require_admin(user)
            name, email = _login_fields(db, name, email, password)
            parent = _employee_parent(db, user, client_id)
            employee = auth_service.create_employee(db, parent, email, password, name)
            log("EMPLOYEE_CREATED", employee_id=employee.id, admin_id=parent.id, by=user.id)
            return _employee_public(db, employee)

    @mcp.tool()
    def set_employee_password(employee_id: int, new_password: str, confirm: bool = False) -> dict:
        """Reset an employee's dashboard password. Requires confirm=true."""
        _require_password_confirm(confirm, "עובד", new_password)
        with db_session() as db:
            user = current_user(db)
            require_admin(user)
            employee = _managed_employee(db, user, employee_id)
            auth_service.change_password(db, employee, new_password)
            log("PASSWORD_RESET", user_id=employee.id, by=user.id)
            return {"status": "password_set", "id": employee.id, "email": employee.email}


def _login_fields(db, name: str, email: str, password: str) -> tuple[str, str]:
    cleaned_name = (name or "").strip()
    cleaned_email = (email or "").strip().lower()
    if len(cleaned_name) < 2:
        raise fail("שם חייב להיות לפחות 2 תווים")
    if "@" not in cleaned_email or "." not in cleaned_email.split("@")[-1]:
        raise fail("אימייל לא תקין")
    if len(password or "") < 8:
        raise fail("סיסמה חייבת להיות לפחות 8 תווים")
    if auth_service.email_exists(db, cleaned_email):
        raise fail("האימייל כבר רשום")
    return cleaned_name, cleaned_email


def _require_password_confirm(confirm: bool, who: str, password: str) -> None:
    if not confirm:
        raise fail(f"כדי לשנות סיסמת {who} צריך confirm=true")
    if len(password or "") < 8:
        raise fail("סיסמה חייבת להיות לפחות 8 תווים")


def _client(db, client_id: int) -> AuthUser:
    admin = auth_service.get_by_id(db, client_id)
    if not admin or admin.role != UserRole.ADMIN:
        raise fail("לקוח לא נמצא")
    return admin


def _employee_parent(db, user: AuthUser, client_id: Optional[int]) -> AuthUser:
    if user.role == UserRole.ADMIN:
        if client_id is not None and client_id != user.id:
            raise fail("לקוח יכול ליצור עובדים רק תחת עצמו")
        return user
    if client_id is None:
        raise fail("מנהל ראשי חייב לציין client_id — לאיזה לקוח שייך העובד")
    return _client(db, client_id)


def _managed_employee(db, user: AuthUser, employee_id: int) -> AuthUser:
    employee = auth_service.get_by_id(db, employee_id)
    if not employee or employee.role != UserRole.EMPLOYEE:
        raise fail("עובד לא נמצא")
    if not auth_service.can_manage_employee(user, employee):
        raise fail("אין גישה לעובד הזה")
    return employee


def _client_public(db, admin: AuthUser) -> dict:
    agents = auth_service.get_admin_agents(db, admin.id)
    return {
        "id": admin.id,
        "name": admin.name,
        "email": admin.email,
        "is_active": admin.is_active,
        "agent_ids": [a.id for a in agents],
        "agent_names": [a.name for a in agents],
    }


def _employee_public(db, employee: AuthUser) -> dict:
    parent = auth_service.get_by_id(db, employee.parent_id) if employee.parent_id else None
    return {
        "id": employee.id,
        "name": employee.name,
        "email": employee.email,
        "is_active": employee.is_active,
        "client_id": employee.parent_id,
        "client_name": parent.name if parent else None,
    }
