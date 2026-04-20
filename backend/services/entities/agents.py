from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from backend.models.agent import Agent

_JSON_FIELDS = {"provider_config", "batching_config", "usage_stats", "calendar_config",
                "summary_config", "followup_config", "media_config", "custom_api_keys"}


def get_by_phone_number_id(db: Session, phone_number_id: str) -> Agent | None:
    return db.query(Agent).filter(
        Agent.phone_number_id == phone_number_id,
        Agent.is_active == True
    ).first()


def get_all(db: Session) -> list[Agent]:
    return db.query(Agent).all()


def get_by_id(db: Session, agent_id: int) -> Agent | None:
    return db.query(Agent).filter(Agent.id == agent_id).first()


def create(
    db: Session,
    name: str,
    phone_number_id: str,
    access_token: str,
    verify_token: str,
    system_prompt: str,
    model: str = "claude-sonnet-4-20250514",
    provider: str = "meta",
    provider_config: dict | None = None,
    batching_config: dict | None = None
) -> Agent:
    agent = Agent(
        name=name,
        phone_number_id=phone_number_id,
        access_token=access_token,
        verify_token=verify_token,
        system_prompt=system_prompt,
        model=model,
        provider=provider,
        provider_config=provider_config or {},
        batching_config=batching_config,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


def update(db: Session, agent_id: int, **kwargs) -> Agent | None:
    agent = get_by_id(db, agent_id)
    if not agent:
        return None
    for key, value in kwargs.items():
        if hasattr(agent, key) and value is not None:
            setattr(agent, key, value)
            if key in _JSON_FIELDS:
                flag_modified(agent, key)
    db.commit()
    db.refresh(agent)
    return agent


def delete(db: Session, agent_id: int) -> bool:
    agent = get_by_id(db, agent_id)
    if not agent:
        return False
    db.delete(agent)
    db.commit()
    return True
