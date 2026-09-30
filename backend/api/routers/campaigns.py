"""Campaign HTTP. Auth and validation only."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth.dependencies import get_current_user, require_role
from backend.auth.models import AuthUser, UserRole
from backend.core.database import get_db
from backend.models.agent import Agent
from backend.models.campaign import Campaign, CampaignImport, CampaignRecipient
from backend.services.campaigns import access, catalog, compose, constants as C, view
from backend.services.campaigns.feed import sse_lines
from backend.services.entities import agents

router = APIRouter(tags=["campaigns"])
_super = Depends(require_role(UserRole.SUPER_ADMIN))


class CampaignIn(BaseModel):
    agent_id: int
    name: str = Field(min_length=1, max_length=120)


class CampaignPatch(BaseModel):
    name: str | None = None
    description: str | None = None
    mode: str | None = None
    template_body: str | None = None
    prompt: str | None = None
    column_defaults: dict | None = None
    rephrase_enabled: bool | None = None
    writer_model: str | None = None
    rephrase_model: str | None = None
    window_start: str | None = None
    window_end: str | None = None
    timezone: str | None = None
    skip_recent_amount: int | None = None
    skip_recent_unit: str | None = None
    steps: list[dict] | None = None
    media_description: str | None = None


class FlagIn(BaseModel):
    enabled: bool
    resume: bool = False


class StartIn(BaseModel):
    starts_at: str | None = None


class TestIn(BaseModel):
    phone: str


def _user_campaign(db, user, campaign_id: int) -> tuple[Campaign, Agent]:
    campaign = db.get(Campaign, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="not_found")
    agent = agents.get_by_id(db, campaign.agent_id)
    if agent is None or not access.can_see(user, agent):
        raise HTTPException(status_code=404, detail="not_found")
    return campaign, agent


def _full(user: AuthUser) -> bool:
    return user.role == UserRole.SUPER_ADMIN


@router.get("/campaigns")
def list_campaigns(
    agent_id: int | None = None,
    status: str | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    if user.role == UserRole.EMPLOYEE:
        raise HTTPException(status_code=403, detail="forbidden")
    query = db.query(Campaign, Agent).join(Agent, Agent.id == Campaign.agent_id)
    if user.role != UserRole.SUPER_ADMIN:
        query = query.filter(Agent.owner_id == user.id)
    if agent_id is not None:
        query = query.filter(Campaign.agent_id == agent_id)
    if status:
        query = query.filter(Campaign.status == status)
    else:
        query = query.filter(Campaign.status.in_((C.RUNNING, C.PAUSED)))
    if q:
        query = query.filter(Campaign.name.ilike(f"%{q[:80]}%"))
    total = query.count()
    rows = (
        query.order_by(Campaign.updated_at.desc())
        .offset((page - 1) * C.PAGE)
        .limit(C.PAGE)
        .all()
    )
    full = _full(user)
    items = [
        view.campaign_row(db, campaign, agent.name, view.session_label(db, agent.id), full=full)
        for campaign, agent in rows
    ]
    return {"items": items, "total": total, "page": page, "page_size": C.PAGE}


@router.post("/campaigns")
def create_campaign(
    body: CampaignIn,
    db: Session = Depends(get_db),
    user: AuthUser = _super,
):
    agent = agents.get_by_id(db, body.agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="not_found")
    if not agent.campaigns_enabled:
        raise HTTPException(status_code=422, detail="flag")
    campaign = catalog.create(db, agent.id, body.name)
    db.commit()
    return view.campaign_row(db, campaign, agent.name, view.session_label(db, agent.id), full=True)


@router.get("/campaigns/{campaign_id}")
def get_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    campaign, agent = _user_campaign(db, user, campaign_id)
    return view.campaign_row(db, campaign, agent.name, view.session_label(db, agent.id), full=_full(user))


@router.patch("/campaigns/{campaign_id}")
def patch_campaign(
    campaign_id: int,
    body: CampaignPatch,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    campaign, agent = _user_campaign(db, user, campaign_id)
    if campaign.status not in (C.DRAFT, C.PAUSED):
        raise HTTPException(status_code=422, detail="locked")
    data = body.model_dump(exclude_unset=True)
    steps = data.pop("steps", None)
    owner_fields = {"name", "description", "template_body", "prompt", "window_start", "window_end", "timezone", "skip_recent_amount", "skip_recent_unit", "media_description"}
    super_fields = owner_fields | {"mode", "column_defaults", "rephrase_enabled", "writer_model", "rephrase_model"}
    allowed = super_fields if _full(user) else owner_fields
    for key, value in data.items():
        if key in allowed:
            setattr(campaign, key, value)
    template = data.get("template_body", campaign.template_body)
    if data.get("mode", campaign.mode) == "template" and template:
        missing = compose.unknown_tokens(template, _columns(db, campaign.id))
        if missing:
            raise HTTPException(status_code=422, detail="unknown_column")
    if steps is not None:
        if not _full(user) and campaign.status != C.PAUSED and campaign.status != C.DRAFT:
            raise HTTPException(status_code=403, detail="forbidden")
        try:
            catalog.replace_steps(db, campaign, steps)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
    db.commit()
    return view.campaign_row(db, campaign, agent.name, view.session_label(db, agent.id), full=_full(user))


@router.post("/campaigns/{campaign_id}/pause")
def pause_campaign(campaign_id: int, db: Session = Depends(get_db), user: AuthUser = Depends(get_current_user)):
    campaign, agent = _user_campaign(db, user, campaign_id)
    catalog.pause(db, campaign)
    db.commit()
    return {"status": campaign.status}


@router.post("/campaigns/{campaign_id}/resume")
def resume_campaign(campaign_id: int, db: Session = Depends(get_db), user: AuthUser = Depends(get_current_user)):
    campaign, agent = _user_campaign(db, user, campaign_id)
    try:
        catalog.resume(db, campaign)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    db.commit()
    return {"status": campaign.status}


@router.post("/campaigns/{campaign_id}/start")
def start_campaign(
    campaign_id: int,
    body: StartIn | None = None,
    db: Session = Depends(get_db),
    user: AuthUser = _super,
):
    campaign, agent = _user_campaign(db, user, campaign_id)
    try:
        catalog.start(db, campaign, agent, _starts_at(body.starts_at if body else None, campaign.timezone))
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    db.commit()
    return {"status": campaign.status}


@router.post("/campaigns/{campaign_id}/retry")
def retry_campaign(campaign_id: int, db: Session = Depends(get_db), user: AuthUser = Depends(get_current_user)):
    campaign, _agent = _user_campaign(db, user, campaign_id)
    count = catalog.retry_failed(db, campaign)
    db.commit()
    return {"retried": count}


@router.post("/campaigns/{campaign_id}/finish")
def finish_campaign(campaign_id: int, db: Session = Depends(get_db), user: AuthUser = Depends(get_current_user)):
    campaign, _agent = _user_campaign(db, user, campaign_id)
    try:
        catalog.finish(db, campaign)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    db.commit()
    return {"status": campaign.status}


@router.delete("/campaigns/{campaign_id}")
def delete_campaign(campaign_id: int, db: Session = Depends(get_db), user: AuthUser = _super):
    campaign, _agent = _user_campaign(db, user, campaign_id)
    try:
        catalog.erase(db, campaign)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    db.commit()
    return {"status": "deleted"}


@router.get("/campaigns/{campaign_id}/recipients")
def list_recipients(
    campaign_id: int,
    status: str | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    campaign, _agent = _user_campaign(db, user, campaign_id)
    query = db.query(CampaignRecipient).filter(CampaignRecipient.campaign_id == campaign.id)
    if q:
        needle = q.strip()[:40]
        from sqlalchemy import String, cast, or_
        query = query.filter(or_(
            CampaignRecipient.phone.contains(needle),
            cast(CampaignRecipient.fields, String).ilike(f"%{needle}%"),
        ))
    total = query.count()
    rows = query.order_by(CampaignRecipient.sort_order).offset((page - 1) * C.PAGE).limit(C.PAGE).all()
    return {
        "items": [_recipient(db, campaign, row) for row in rows],
        "total": total,
        "page": page,
        "counts": _counts(db, campaign.id),
    }


@router.get("/campaigns/{campaign_id}/live")
async def campaign_live(
    campaign_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    _user_campaign(db, user, campaign_id)

    async def gen():
        async for line in sse_lines(campaign_id, request.is_disconnected):
            yield line

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.put("/agents/{agent_id}/campaigns")
async def put_flag(
    agent_id: int,
    body: FlagIn,
    db: Session = Depends(get_db),
    user: AuthUser = _super,
):
    agent = agents.get_by_id(db, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="not_found")
    ids = catalog.set_enabled(db, agent, body.enabled, body.resume)
    db.commit()
    if body.enabled:
        from backend.services.silence.listen import ensure_listen_events
        await ensure_listen_events(db, agent.id)
    waiting = [
        {"id": campaign.id, "name": campaign.name}
        for campaign in catalog.paused_by_flag(db, agent.id)
    ] if body.enabled and not body.resume else []
    return {"enabled": agent.campaigns_enabled, "paused": waiting, "resumed": ids if body.resume else []}


@router.put("/agents/{agent_id}/campaign-caps")
def put_caps(
    agent_id: int,
    body: CapsIn,
    db: Session = Depends(get_db),
    user: AuthUser = _super,
):
    agent = agents.get_by_id(db, agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="not_found")
    try:
        catalog.set_caps(agent, body.hourly_cap, body.daily_cap)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    db.commit()
    return {"hourly_cap": agent.campaign_hourly_cap, "daily_cap": agent.campaign_daily_cap}


def _starts_at(wall: str | None, tz_name: str):
    if not wall:
        return None
    from datetime import datetime
    from zoneinfo import ZoneInfo

    naive = datetime.fromisoformat(wall)
    try:
        zone = ZoneInfo(tz_name or "Asia/Jerusalem")
    except Exception:
        zone = ZoneInfo("Asia/Jerusalem")
    return naive.replace(tzinfo=zone).astimezone(ZoneInfo("UTC")).replace(tzinfo=None)


def _columns(db: Session, campaign_id: int) -> set[str]:
    from backend.models.campaign import CampaignRecipient

    rows = db.query(CampaignRecipient.fields).filter(CampaignRecipient.campaign_id == campaign_id).limit(1).all()
    if not rows or not isinstance(rows[0][0], dict):
        return set()
    return set(rows[0][0].keys())


def _recipient(db, campaign, row: CampaignRecipient) -> dict:
    from backend.models.campaign import CampaignSend
    send = (
        db.query(CampaignSend)
        .filter(CampaignSend.recipient_id == row.id, CampaignSend.step_position == campaign.current_step)
        .first()
    )
    return {
        "phone": row.phone,
        "name": _person_name(row.fields),
        "status": "replied" if row.replied_at else (send.status if send else "pending"),
        "reason": send.fail_reason if send else None,
    }


def _person_name(fields: dict | None) -> str:
    data = fields or {}
    for key in ("שם", "שם מלא", "name", "Name", "full_name", "fullname"):
        value = str(data.get(key) or "").strip()
        if value:
            return value[:80]
    for key, value in data.items():
        if "שם" in str(key) or str(key).lower().replace(" ", "") in ("name", "fullname"):
            text = str(value or "").strip()
            if text:
                return text[:80]
    return ""


def _counts(db, campaign_id: int) -> dict:
    from backend.models.campaign import CampaignSend
    from sqlalchemy import func
    rows = (
        db.query(CampaignSend.status, func.count(CampaignSend.id))
        .filter(CampaignSend.campaign_id == campaign_id)
        .group_by(CampaignSend.status)
        .all()
    )
    return {status: count for status, count in rows}


from backend.api.routers import campaign_audience as _campaign_audience  # noqa: F401
