"""Who may see a campaign. Employees never do."""
from backend.auth.models import UserRole
from backend.models.agent import Agent
from backend.models.campaign import Campaign


def can_see(user, agent: Agent) -> bool:
    if user.role == UserRole.EMPLOYEE:
        return False
    if user.role == UserRole.SUPER_ADMIN:
        return True
    return agent.owner_id == user.id


def can_edit(user) -> bool:
    return user.role == UserRole.SUPER_ADMIN


def user_sees_campaigns(db, user) -> bool:
    if user.role == UserRole.SUPER_ADMIN:
        return True
    if user.role == UserRole.ADMIN:
        return admin_has_campaign(db, user.id)
    return False


def admin_has_campaign(db, admin_id: int) -> bool:
    return (
        db.query(Campaign.id)
        .join(Agent, Agent.id == Campaign.agent_id)
        .filter(Agent.owner_id == admin_id)
        .first()
        is not None
    )


def agent_has_campaign(db, agent_id: int) -> bool:
    return db.query(Campaign.id).filter(Campaign.agent_id == agent_id).first() is not None
