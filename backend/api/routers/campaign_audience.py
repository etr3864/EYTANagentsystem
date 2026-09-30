"""Audience upload, preview, and the one test send."""
from fastapi import Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.api.routers.campaigns import TestIn, _full, _super, _user_campaign, router
from backend.auth.dependencies import get_current_user
from backend.auth.models import AuthUser
from backend.core.database import get_db
from backend.models.campaign import CampaignImport, CampaignRecipient
from backend.services.campaigns import audience, catalog, compose, constants as C, session_lock
from backend.services.campaigns.media_file import store_media


@router.post("/campaigns/{campaign_id}/audience")
async def upload_audience(
    campaign_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: AuthUser = _super,
):
    campaign, _agent = _user_campaign(db, user, campaign_id)
    if campaign.status != C.DRAFT:
        raise HTTPException(status_code=422, detail="not_draft")
    payload = await file.read(C.UPLOAD_CAP + 1)
    if len(payload) > C.UPLOAD_CAP:
        raise HTTPException(status_code=413, detail="file_too_large")
    try:
        headers, sample = audience.preview(file.filename or "", payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    job = CampaignImport(
        campaign_id=campaign.id,
        filename=file.filename or "audience.csv",
        payload=payload,
        headers=headers,
        status="uploaded",
    )
    db.add(job)
    db.commit()
    return {"import_id": job.id, "headers": headers, "sample": sample}


@router.post("/campaigns/{campaign_id}/audience/{import_id}")
def commit_audience(
    campaign_id: int,
    import_id: int,
    phone_column: str = Form(...),
    db: Session = Depends(get_db),
    user: AuthUser = _super,
):
    campaign, _agent = _user_campaign(db, user, campaign_id)
    job = db.get(CampaignImport, import_id)
    if job is None or job.campaign_id != campaign.id:
        raise HTTPException(status_code=404, detail="not_found")
    if phone_column not in (job.headers or []):
        raise HTTPException(status_code=422, detail="phone_column")
    job.phone_column = phone_column
    job.status = "queued"
    db.commit()
    from backend.tasks.campaign_import import run_import
    run_import.delay(job.id)
    return {"status": "queued"}


@router.get("/campaigns/{campaign_id}/audience/{import_id}")
def import_status(
    campaign_id: int,
    import_id: int,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    campaign, _agent = _user_campaign(db, user, campaign_id)
    job = db.get(CampaignImport, import_id)
    if job is None or job.campaign_id != campaign.id:
        raise HTTPException(status_code=404, detail="not_found")
    dupes = catalog.duplicate_phones(db, campaign) if job.status == "done" else []
    return {"status": job.status, "error": job.error, "duplicates": len(dupes)}


@router.post("/campaigns/{campaign_id}/duplicates/drop")
def drop_dupes(campaign_id: int, db: Session = Depends(get_db), user: AuthUser = _super):
    campaign, _agent = _user_campaign(db, user, campaign_id)
    removed = catalog.drop_duplicates(db, campaign)
    db.commit()
    return {"removed": removed}


@router.post("/campaigns/{campaign_id}/preview")
async def preview_message(
    campaign_id: int,
    db: Session = Depends(get_db),
    user: AuthUser = Depends(get_current_user),
):
    campaign, agent = _user_campaign(db, user, campaign_id)
    recipient = (
        db.query(CampaignRecipient)
        .filter(CampaignRecipient.campaign_id == campaign.id)
        .order_by(CampaignRecipient.sort_order)
        .first()
    )
    fields = recipient.fields if recipient else {}
    from backend.models.campaign import CampaignStep
    step = (
        db.query(CampaignStep)
        .filter(CampaignStep.campaign_id == campaign.id, CampaignStep.position == 1)
        .first()
    )
    try:
        text, _usage = await compose.compose(db, agent, campaign, step, fields or {})
    except Exception as error:
        raise HTTPException(status_code=422, detail="compose") from error
    db.commit()
    shown = {"text": text}
    if _full(user):
        shown["phone"] = recipient.phone if recipient else None
    return shown


@router.post("/campaigns/{campaign_id}/test-send")
async def test_send(
    campaign_id: int,
    body: TestIn,
    db: Session = Depends(get_db),
    user: AuthUser = _super,
):
    campaign, agent = _user_campaign(db, user, campaign_id)
    from backend.services.channels.agent_channels import get_channel_by_type
    from backend.core.encryption import decrypt_credentials
    from backend.services.channels import wasender
    from backend.services.silence.phones import canonical

    phone = canonical(body.phone)
    if not phone:
        raise HTTPException(status_code=422, detail="phone")
    channel = get_channel_by_type(db, agent.id, "whatsapp_wasender")
    if channel is None:
        raise HTTPException(status_code=422, detail="session")
    text, _usage = await compose.compose(db, agent, campaign, None, {})
    if session_lock.live_waiting(channel.id) or not session_lock.try_send_lock(channel.id):
        raise HTTPException(status_code=409, detail="busy")
    try:
        creds = decrypt_credentials(channel.credentials_encrypted)
        outcome = await wasender.send_once(
            creds["api_key"], creds.get("session", "default"), phone, text, timeout=C.HTTP_TIMEOUT,
        )
    finally:
        session_lock.release_send_lock(channel.id)
    db.commit()
    if not outcome.get("msg_id"):
        raise HTTPException(status_code=502, detail=outcome.get("error") or "send")
    return {"status": "sent"}


@router.post("/campaigns/{campaign_id}/media")
async def upload_media(
    campaign_id: int,
    file: UploadFile = File(...),
    description: str = Form(""),
    db: Session = Depends(get_db),
    user: AuthUser = _super,
):
    campaign, agent = _user_campaign(db, user, campaign_id)
    if campaign.status not in (C.DRAFT, C.PAUSED):
        raise HTTPException(status_code=422, detail="locked")
    payload = await file.read(C.UPLOAD_CAP + 1)
    try:
        stored = await store_media(agent.id, file.filename or "file", payload, description)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    campaign.media_kind = stored["kind"]
    campaign.media_key = stored["key"]
    campaign.media_mime = stored["mime"]
    campaign.media_name = stored["name"]
    campaign.media_description = stored["description"]
    db.commit()
    return {"kind": stored["kind"], "name": stored["name"]}
