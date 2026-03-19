"""Super Admin dashboard endpoints.

All routes require SUPER_ADMIN role.
Returns system-wide performance and cost data for all agents.
"""
from datetime import date, datetime, time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_user, require_super_admin
from backend.auth.models import AuthUser
from backend.core.database import get_db
from backend.models.agent import Agent
from backend.models.appointment import Appointment
from backend.models.conversation import Conversation
from backend.models.message import Message
from backend.models.scheduled_followup import ScheduledFollowup
from backend.core.enums import FollowupStatus
from backend.services.pricing import get_pricing, calc_cost_ils, upsert_pricing

router = APIRouter(tags=["super-admin-dashboard"])

_require_super_admin = require_super_admin()


# ── Pydantic models ──────────────────────────────────────────────────────────

class SystemSummary(BaseModel):
    total_cost_ils: float
    total_conversations: int
    avg_cost_per_conversation_ils: float
    avg_messages_per_conversation: float


class AgentTableRow(BaseModel):
    agent_id: int
    agent_name: str
    client_name: str
    total_conversations: int
    total_messages: int
    total_cost_ils: float
    avg_cost_per_conversation_ils: float


class AgentPerformanceDetail(BaseModel):
    total_conversations: int
    total_messages: int
    avg_messages_per_conversation: float
    appointments_scheduled: int
    conversion_rate: float
    followups_sent: int
    followup_response_rate: float


class AgentCostByProvider(BaseModel):
    anthropic_ils: float
    google_ils: float
    openai_ils: float
    other_ils: float
    total_ils: float


class AgentCostBySource(BaseModel):
    conversation_ils: float
    followup_ils: float
    context_summary_ils: float
    summary_ils: float
    reminder_ils: float


class AgentDetail(BaseModel):
    performance: AgentPerformanceDetail
    cost_by_provider: AgentCostByProvider
    cost_by_source: AgentCostBySource
    total_cost_ils: float
    avg_cost_per_conversation_ils: float
    total_appointments: int


class PricingConfigResponse(BaseModel):
    config: dict[str, float]


# ── Helpers ──────────────────────────────────────────────────────────────────

def _date_range(from_date: date, to_date: date) -> tuple[datetime, datetime]:
    return datetime.combine(from_date, time.min), datetime.combine(to_date, time.max)


def _get_all_agent_ids(db: Session) -> list[int]:
    return [row[0] for row in db.query(Agent.id).filter(Agent.is_active == True).all()]


def _query_usage_cost(
    db: Session,
    agent_ids: list[int],
    from_date: date,
    to_date: date,
    pricing: dict,
) -> dict[int, float]:
    """Returns {agent_id: total_cost_ils} for the date range."""
    if not agent_ids:
        return {}

    rows = db.execute(
        text("""
            SELECT agent_id, model,
                   SUM(input_tokens) AS inp, SUM(output_tokens) AS out
            FROM agent_usage_daily
            WHERE agent_id = ANY(:ids) AND date >= :from_d AND date <= :to_d
            GROUP BY agent_id, model
        """),
        {"ids": agent_ids, "from_d": from_date, "to_d": to_date},
    ).fetchall()

    costs: dict[int, float] = {}
    for agent_id, model, inp, out in rows:
        cost = calc_cost_ils(model, int(inp or 0), int(out or 0), pricing)
        costs[agent_id] = costs.get(agent_id, 0.0) + cost
    return costs


def _query_perf(
    db: Session,
    agent_ids: list[int],
    from_dt: datetime,
    to_dt: datetime,
) -> dict[int, dict]:
    """Returns {agent_id: {conversations, messages}} for the date range."""
    if not agent_ids:
        return {}

    rows = db.execute(
        text("""
            SELECT c.agent_id,
                   COUNT(DISTINCT c.id) AS convs,
                   COUNT(m.id)          AS msgs
            FROM conversations c
            JOIN messages m ON m.conversation_id = c.id
            WHERE c.agent_id = ANY(:ids)
              AND m.created_at >= :from_dt
              AND m.created_at <= :to_dt
              AND m.role = 'user'
            GROUP BY c.agent_id
        """),
        {"ids": agent_ids, "from_dt": from_dt, "to_dt": to_dt},
    ).fetchall()

    return {
        agent_id: {"conversations": int(convs), "messages": int(msgs)}
        for agent_id, convs, msgs in rows
    }


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/super-admin/summary", response_model=SystemSummary)
def get_system_summary(
    from_date: date = Query(...),
    to_date: date = Query(...),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(_require_super_admin),
):
    if to_date < from_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="to_date must be >= from_date")

    pricing = get_pricing(db)
    agent_ids = _get_all_agent_ids(db)
    from_dt, to_dt = _date_range(from_date, to_date)

    costs = _query_usage_cost(db, agent_ids, from_date, to_date, pricing)
    perf = _query_perf(db, agent_ids, from_dt, to_dt)

    total_cost = round(sum(costs.values()), 4)
    total_convs = sum(v["conversations"] for v in perf.values())
    total_msgs = sum(v["messages"] for v in perf.values())

    avg_cost = round(total_cost / total_convs, 4) if total_convs > 0 else 0.0
    avg_msgs = round(total_msgs / total_convs, 2) if total_convs > 0 else 0.0

    return SystemSummary(
        total_cost_ils=total_cost,
        total_conversations=total_convs,
        avg_cost_per_conversation_ils=avg_cost,
        avg_messages_per_conversation=avg_msgs,
    )


@router.get("/super-admin/agents-table", response_model=list[AgentTableRow])
def get_agents_table(
    from_date: date = Query(...),
    to_date: date = Query(...),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(_require_super_admin),
):
    if to_date < from_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="to_date must be >= from_date")

    pricing = get_pricing(db)
    from_dt, to_dt = _date_range(from_date, to_date)

    agents = (
        db.query(Agent.id, Agent.name, Agent.owner_id)
        .filter(Agent.is_active == True)
        .all()
    )
    if not agents:
        return []

    agent_ids = [a.id for a in agents]

    # Load owner names in bulk
    from backend.auth.models import AuthUser as AU
    owner_ids = list({a.owner_id for a in agents if a.owner_id})
    owners = {
        u.id: u.name
        for u in db.query(AU.id, AU.name).filter(AU.id.in_(owner_ids)).all()
    } if owner_ids else {}

    costs = _query_usage_cost(db, agent_ids, from_date, to_date, pricing)
    perf = _query_perf(db, agent_ids, from_dt, to_dt)

    rows = []
    for agent_id, agent_name, owner_id in agents:
        cost = costs.get(agent_id, 0.0)
        p = perf.get(agent_id, {"conversations": 0, "messages": 0})
        convs = p["conversations"]
        rows.append(AgentTableRow(
            agent_id=agent_id,
            agent_name=agent_name,
            client_name=owners.get(owner_id, "—") if owner_id else "—",
            total_conversations=convs,
            total_messages=p["messages"],
            total_cost_ils=round(cost, 4),
            avg_cost_per_conversation_ils=round(cost / convs, 4) if convs > 0 else 0.0,
        ))

    rows.sort(key=lambda r: r.total_cost_ils, reverse=True)
    return rows


@router.get("/super-admin/agents/{agent_id}/detail", response_model=AgentDetail)
def get_agent_detail(
    agent_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    db: Session = Depends(get_db),
    _: AuthUser = Depends(_require_super_admin),
):
    if to_date < from_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="to_date must be >= from_date")

    if not db.query(Agent.id).filter(Agent.id == agent_id).first():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent not found")

    pricing = get_pricing(db)
    from_dt, to_dt = _date_range(from_date, to_date)

    perf = _build_performance(db, agent_id, from_dt, to_dt)
    cost_by_provider, cost_by_source, total_cost = _build_costs(
        db, agent_id, from_date, to_date, pricing
    )

    avg_cost = round(total_cost / perf.total_conversations, 4) if perf.total_conversations > 0 else 0.0

    return AgentDetail(
        performance=perf,
        cost_by_provider=cost_by_provider,
        cost_by_source=cost_by_source,
        total_cost_ils=total_cost,
        avg_cost_per_conversation_ils=avg_cost,
        total_appointments=perf.appointments_scheduled,
    )


def _build_performance(
    db: Session, agent_id: int, from_dt: datetime, to_dt: datetime
) -> AgentPerformanceDetail:
    base_msg = (
        db.query(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .filter(
            Conversation.agent_id == agent_id,
            Message.created_at >= from_dt,
            Message.created_at <= to_dt,
        )
    )

    total_conversations: int = (
        base_msg.with_entities(func.count(func.distinct(Message.conversation_id)))
        .filter(Message.role == "user")
        .scalar() or 0
    )
    total_messages: int = base_msg.with_entities(func.count(Message.id)).scalar() or 0
    avg_msgs = round(total_messages / total_conversations, 2) if total_conversations > 0 else 0.0

    appointments: int = (
        db.query(func.count(Appointment.id))
        .filter(
            Appointment.agent_id == agent_id,
            Appointment.status != "cancelled",
            Appointment.created_at >= from_dt,
            Appointment.created_at <= to_dt,
        )
        .scalar() or 0
    )

    conversion_rate = round(appointments / total_conversations * 100, 1) if total_conversations > 0 else 0.0

    base_fu = db.query(ScheduledFollowup).filter(
        ScheduledFollowup.agent_id == agent_id,
        ScheduledFollowup.status == FollowupStatus.SENT,
        ScheduledFollowup.sent_at >= from_dt,
        ScheduledFollowup.sent_at <= to_dt,
    )
    followups_sent: int = (
        base_fu.with_entities(func.count(func.distinct(ScheduledFollowup.conversation_id))).scalar() or 0
    )
    followups_responded: int = (
        base_fu.filter(ScheduledFollowup.responded_at.isnot(None))
        .with_entities(func.count(func.distinct(ScheduledFollowup.conversation_id)))
        .scalar() or 0
    )
    response_rate = round(followups_responded / followups_sent * 100, 1) if followups_sent > 0 else 0.0

    return AgentPerformanceDetail(
        total_conversations=total_conversations,
        total_messages=total_messages,
        avg_messages_per_conversation=avg_msgs,
        appointments_scheduled=appointments,
        conversion_rate=conversion_rate,
        followups_sent=followups_sent,
        followup_response_rate=response_rate,
    )


_ANTHROPIC_MODELS = {"claude"}
_GOOGLE_MODELS = {"gemini"}
_OPENAI_MODELS = {"gpt"}


def _provider_of(model: str) -> str:
    m = model.lower()
    if any(m.startswith(p) for p in _ANTHROPIC_MODELS):
        return "anthropic"
    if any(m.startswith(p) for p in _GOOGLE_MODELS):
        return "google"
    if any(m.startswith(p) for p in _OPENAI_MODELS):
        return "openai"
    return "other"


def _build_costs(
    db: Session,
    agent_id: int,
    from_date: date,
    to_date: date,
    pricing: dict,
) -> tuple[AgentCostByProvider, AgentCostBySource, float]:
    rows = db.execute(
        text("""
            SELECT model, source,
                   SUM(input_tokens) AS inp, SUM(output_tokens) AS out
            FROM agent_usage_daily
            WHERE agent_id = :id AND date >= :from_d AND date <= :to_d
            GROUP BY model, source
        """),
        {"id": agent_id, "from_d": from_date, "to_d": to_date},
    ).fetchall()

    by_provider: dict[str, float] = {"anthropic": 0.0, "google": 0.0, "openai": 0.0, "other": 0.0}
    by_source: dict[str, float] = {
        "conversation": 0.0, "followup": 0.0,
        "context_summary": 0.0, "summary": 0.0, "reminder": 0.0,
    }

    for model, source, inp, out in rows:
        cost = calc_cost_ils(model, int(inp or 0), int(out or 0), pricing)
        provider = _provider_of(model)
        by_provider[provider] = by_provider.get(provider, 0.0) + cost
        by_source[source] = by_source.get(source, 0.0) + cost

    total = round(sum(by_provider.values()), 4)

    return (
        AgentCostByProvider(
            anthropic_ils=round(by_provider["anthropic"], 4),
            google_ils=round(by_provider["google"], 4),
            openai_ils=round(by_provider["openai"], 4),
            other_ils=round(by_provider.get("other", 0.0), 4),
            total_ils=total,
        ),
        AgentCostBySource(
            conversation_ils=round(by_source.get("conversation", 0.0), 4),
            followup_ils=round(by_source.get("followup", 0.0), 4),
            context_summary_ils=round(by_source.get("context_summary", 0.0), 4),
            summary_ils=round(by_source.get("summary", 0.0), 4),
            reminder_ils=round(by_source.get("reminder", 0.0), 4),
        ),
        total,
    )


@router.get("/super-admin/pricing", response_model=PricingConfigResponse)
def get_pricing_config(
    db: Session = Depends(get_db),
    _: AuthUser = Depends(_require_super_admin),
):
    return PricingConfigResponse(config=get_pricing(db))


@router.put("/super-admin/pricing", response_model=PricingConfigResponse)
def update_pricing_config(
    updates: dict[str, float],
    db: Session = Depends(get_db),
    _: AuthUser = Depends(_require_super_admin),
):
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")
    upsert_pricing(db, updates)
    db.commit()
    return PricingConfigResponse(config=get_pricing(db))
