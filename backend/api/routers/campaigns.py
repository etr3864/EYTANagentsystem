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
    reply_window_amount: int | None = None
    reply_window_unit: str | None = None
    hourly_cap: int | None = None
    daily_cap: int | None = None
    steps: list[dict] | None = None
    media_description: str | None = None


class FlagIn(BaseModel):
    enabled: bool
    resume: bool = False


class StartIn(BaseModel):
    starts_at: str | None = None


class CapsIn(BaseModel):
    hourly_cap: int
    daily_cap: int


class TestIn(BaseModel):
    phone: str


class OpenChatIn(BaseModel):
    phone: str


class RetryChosenIn(BaseModel):
    phones: list[str] = Field(min_length=1, max_length=50)


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
        view.campaign_row(db, campaign, agent.name, view.session_label(db, agent.id), full=full, hourly_cap=agent.campaign_hourly_cap)
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
    return view.campaign_row(db, campaign, agent.name, view.session_label(db, agent.id), full=True, hourly_cap=agent.campaign_hourly_cap)


@router.get("/campaigns/{campaign_id}")
def get_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    campaign, agent = _user_campaign(db, user, campaign_id)
    return view.campaign_row(db, campaign, agent.name, view.session_label(db, agent.id), full=_full(user), hourly_cap=agent.campaign_hourly_cap)


@router.patch("/campaigns/{campaign_id}")
def patch_campaign(
    campaign_id: int,
    body: CampaignPatch,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    campaign, agent = _user_campaign(db, user, campaign_id)
    data = body.model_dump(exclude_unset=True)
    steps = data.pop("steps", None)
    window_fields = {"reply_window_amount", "reply_window_unit"}
    window_only = bool(data) and set(data) <= window_fields
    if campaign.status not in (C.DRAFT, C.PAUSED) and not window_only:
        raise HTTPException(status_code=422, detail="locked")
    _check_reply_window(data)
    owner_fields = {"name", "description", "template_body", "prompt", "window_start", "window_end", "timezone", "skip_recent_amount", "skip_recent_unit", "media_description"}
    super_fields = owner_fields | {"mode", "column_defaults", "rephrase_enabled", "writer_model", "rephrase_model", "hourly_cap", "daily_cap"} | window_fields
    allowed = super_fields if _full(user) else owner_fields
    _clamp_budget(agent, data)
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
    return view.campaign_row(db, campaign, agent.name, view.session_label(db, agent.id), full=_full(user), hourly_cap=agent.campaign_hourly_cap)


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


@router.post("/campaigns/{campaign_id}/retry-chosen")
def retry_chosen(
    campaign_id: int,
    body: RetryChosenIn,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    campaign, _agent = _user_campaign(db, user, campaign_id)
    from backend.services.silence.phones import canonical
    phones = [canonical(phone) for phone in body.phones]
    phones = [phone for phone in phones if phone]
    try:
        count = catalog.retry_chosen(db, campaign, phones)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
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


@router.post("/campaigns/{campaign_id}/count-replies")
def count_replies(campaign_id: int, db: Session = Depends(get_db), user: AuthUser = Depends(get_current_user)):
    campaign, _agent = _user_campaign(db, user, campaign_id)
    from backend.services.campaigns.records import catch_up_replies
    catch_up_replies(db, campaign)
    return {"replied": campaign.replied_count or 0}


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
    query = _apply_status(query, campaign, status)
    total = query.count()
    rows = query.order_by(CampaignRecipient.sort_order).offset((page - 1) * C.PAGE).limit(C.PAGE).all()
    media_url = _media_url(campaign)
    blocks = _blocks(db, campaign.agent_id, [row.phone for row in rows])
    return {
        "items": [_recipient(db, campaign, row, media_url, blocks.get(row.phone)) for row in rows],
        "total": total,
        "page": page,
        "counts": _counts(db, campaign),
    }


@router.post("/campaigns/{campaign_id}/open-chat")
def open_chat(
    campaign_id: int,
    body: OpenChatIn,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    campaign, agent = _user_campaign(db, user, campaign_id)
    from backend.services.silence.phones import canonical
    from backend.services.campaigns.chat import reveal

    phone = canonical(body.phone)
    if not phone:
        raise HTTPException(status_code=422, detail="phone")
    owned = (
        db.query(CampaignRecipient.id)
        .filter(CampaignRecipient.campaign_id == campaign.id, CampaignRecipient.phone == phone)
        .first()
    )
    if owned is None:
        raise HTTPException(status_code=404, detail="not_found")
    conversation_id = reveal(db, agent.id, phone)
    if conversation_id is None:
        raise HTTPException(status_code=404, detail="no_chat")
    db.commit()
    return {"conversation_id": conversation_id, "agent_id": agent.id, "phone": phone}


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


def _check_reply_window(data: dict) -> None:
    if "reply_window_unit" in data and data["reply_window_unit"] not in ("hours", "days"):
        raise HTTPException(status_code=422, detail="reply_window")
    if "reply_window_amount" in data:
        amount = int(data["reply_window_amount"] or 0)
        if not 1 <= amount <= 999:
            raise HTTPException(status_code=422, detail="reply_window")
        data["reply_window_amount"] = amount


def _clamp_budget(agent, data: dict) -> None:
    if "hourly_cap" not in data and "daily_cap" not in data:
        return
    if not agent.campaign_hourly_cap or not agent.campaign_daily_cap:
        raise HTTPException(status_code=422, detail="caps")
    if "hourly_cap" in data:
        value = int(data["hourly_cap"] or 0)
        if value < 1:
            raise HTTPException(status_code=422, detail="campaign_caps")
        data["hourly_cap"] = min(value, agent.campaign_hourly_cap)
    if "daily_cap" in data:
        value = int(data["daily_cap"] or 0)
        if value < 1:
            raise HTTPException(status_code=422, detail="campaign_caps")
        data["daily_cap"] = min(value, agent.campaign_daily_cap)


def _media_url(campaign) -> str | None:
    if not campaign.media_key:
        return None
    from backend.services.media.storage import get_public_url
    try:
        return get_public_url(campaign.media_key)
    except RuntimeError:
        return None


def _blocks(db, agent_id: int, phones: list[str]) -> dict:
    if not phones:
        return {}
    from backend.models.blocked_number import BlockedNumber
    rows = (
        db.query(BlockedNumber)
        .filter(BlockedNumber.agent_id == agent_id, BlockedNumber.phone.in_(phones))
        .all()
    )
    return {row.phone: row for row in rows if row.manual or row.opted_out}


def _recipient(db, campaign, row: CampaignRecipient, media_url: str | None, blocked=None) -> dict:
    from backend.models.campaign import CampaignSend
    send = (
        db.query(CampaignSend)
        .filter(CampaignSend.recipient_id == row.id, CampaignSend.step_position == campaign.current_step)
        .first()
    )
    went_out = send is not None and send.status == C.SENT
    block_kind = None
    block_quote = None
    if blocked is not None and blocked.opted_out:
        block_kind = "opted_out"
        block_quote = blocked.quote
    elif blocked is not None and blocked.manual:
        block_kind = "manual"
        block_quote = blocked.quote
    status = "replied" if row.replied_at else (send.status if send else "pending")
    if block_kind == "opted_out":
        status = "opted_out"
    elif block_kind == "manual" and status in ("pending", "blocked"):
        status = "blocked"
    return {
        "phone": row.phone,
        "name": _person_name(row.fields),
        "status": status,
        "reason": block_quote or (send.fail_reason if send else None),
        "block_kind": block_kind,
        "sent_at": _clock(send.sent_at, campaign.timezone) if went_out else None,
        "body": send.body if went_out else None,
        "media_url": media_url if went_out else None,
        "media_kind": campaign.media_kind if went_out and media_url else None,
        "media_name": campaign.media_name if went_out and media_url else None,
        "chat": _has_chat(db, campaign.agent_id, row.phone),
    }


def _clock(when, tz_name: str) -> str | None:
    if when is None:
        return None
    from zoneinfo import ZoneInfo
    try:
        zone = ZoneInfo(tz_name or "Asia/Jerusalem")
    except Exception:
        zone = ZoneInfo("Asia/Jerusalem")
    local = when.replace(tzinfo=ZoneInfo("UTC")).astimezone(zone)
    return local.strftime("%d.%m.%Y %H:%M")


def _has_chat(db, agent_id: int, phone: str) -> bool:
    from backend.services.campaigns.chat import live_chat
    return live_chat(db, agent_id, phone) is not None


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


def _apply_status(query, campaign, status: str | None):
    allowed = {"replied", "pending", "sending", "sent", "failed", "uncertain", "blocked", "skipped", "invalid", "opted_out"}
    if status not in allowed:
        return query
    if status == "opted_out":
        from backend.models.blocked_number import BlockedNumber
        return query.join(
            BlockedNumber,
            (BlockedNumber.agent_id == campaign.agent_id) & (BlockedNumber.phone == CampaignRecipient.phone),
        ).filter(BlockedNumber.opted_out.is_(True))
    from sqlalchemy import and_, or_
    from backend.models.campaign import CampaignSend

    if status == "replied":
        return query.filter(CampaignRecipient.replied_at.isnot(None))
    query = query.outerjoin(
        CampaignSend,
        and_(
            CampaignSend.recipient_id == CampaignRecipient.id,
            CampaignSend.step_position == campaign.current_step,
        ),
    ).filter(CampaignRecipient.replied_at.is_(None))
    if status == "pending":
        return query.filter(or_(CampaignSend.id.is_(None), CampaignSend.status == C.PENDING))
    return query.filter(CampaignSend.status == status)


def _counts(db, campaign) -> dict:
    from sqlalchemy import func
    from backend.models.campaign import CampaignSend

    total = (
        db.query(func.count(CampaignRecipient.id))
        .filter(CampaignRecipient.campaign_id == campaign.id)
        .scalar()
    ) or 0
    replied = (
        db.query(func.count(CampaignRecipient.id))
        .filter(CampaignRecipient.campaign_id == campaign.id, CampaignRecipient.replied_at.isnot(None))
        .scalar()
    ) or 0
    rows = (
        db.query(CampaignSend.status, func.count(CampaignSend.id))
        .join(CampaignRecipient, CampaignRecipient.id == CampaignSend.recipient_id)
        .filter(
            CampaignSend.campaign_id == campaign.id,
            CampaignSend.step_position == campaign.current_step,
            CampaignRecipient.replied_at.is_(None),
        )
        .group_by(CampaignSend.status)
        .all()
    )
    counts = {name: count for name, count in rows}
    missing = total - replied - sum(counts.values())
    if missing > 0:
        counts["pending"] = counts.get("pending", 0) + missing
    if replied:
        counts["replied"] = replied
    from backend.models.blocked_number import BlockedNumber
    opted = (
        db.query(func.count(CampaignRecipient.id))
        .join(
            BlockedNumber,
            (BlockedNumber.agent_id == campaign.agent_id) & (BlockedNumber.phone == CampaignRecipient.phone),
        )
        .filter(CampaignRecipient.campaign_id == campaign.id, BlockedNumber.opted_out.is_(True))
        .scalar()
    ) or 0
    if opted:
        counts["opted_out"] = opted
    return {name: count for name, count in counts.items() if count}


from backend.api.routers import campaign_audience as _campaign_audience  # noqa: F401
