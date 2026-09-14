from datetime import datetime
import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.core.logger import log
from backend.services.entities import agents as agents_service, users as users_service
from backend.services.playground import gate, identity, limits, quota, repo, runtime, session, streams
from backend.services.playground import media as pg_media
from backend.services.playground.constants import CLOSED_MESSAGE
from backend.services.playground.identity import storage_phone

router = APIRouter(tags=["playground-public"])


class EnterBody(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    phone: str = Field(min_length=8, max_length=24)


class SendBody(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    reply_to: str | None = Field(default=None, max_length=500)
    message_id: str = Field(min_length=8, max_length=80)


def _link_or_404(db: Session, token: str):
    row = repo.get_by_raw_token(db, token)
    if not row:
        raise HTTPException(status_code=404, detail="קישור לא נמצא")
    return row


def _agent(db: Session, link):
    if not link.agent_id:
        return None
    return agents_service.get_by_id(db, link.agent_id)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for") or ""
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "0"


def _user_from_cookie(db: Session, request: Request, link):
    parsed = session.verify(request.cookies.get(session.COOKIE_NAME))
    if not parsed:
        return None
    cookie_link_id, user_id = parsed
    if cookie_link_id != link.id:
        return None
    user = users_service.get_by_id(db, user_id)
    if not user or user.playground_link_id != link.id:
        return None
    return user


def _evaluate(db: Session, link, agent, user) -> gate.GateResult:
    count = repo.message_count_for_user(db, link.id, user.id) if user else 0
    result = gate.evaluate(link=link, agent=agent, message_count=count)
    if result.reason:
        log("playground_gate", reason=result.reason, link_id=link.id)
    return result


def _cookie_kwargs(request: Request, link) -> dict:
    remaining = 7 * 24 * 3600
    if link.expires_at:
        remaining = max(60, int((link.expires_at - datetime.utcnow()).total_seconds()))
    https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    return {
        "httponly": True,
        "secure": https,
        "samesite": "none" if https else "lax",
        "path": "/",
        "max_age": remaining,
    }


def _gone() -> JSONResponse:
    return JSONResponse(status_code=410, content={"detail": CLOSED_MESSAGE, "closed": True})


@router.get("/{token}")
def bootstrap(token: str, request: Request, db: Session = Depends(get_db)):
    link = _link_or_404(db, token)
    agent = _agent(db, link)
    user = _user_from_cookie(db, request, link)
    result = _evaluate(db, link, agent, user)
    if result.http_gone():
        return _gone()
    payload = runtime.session_payload(db, agent, link, user, result)
    payload["needs_profile"] = user is None
    return payload


@router.post("/{token}/enter")
def enter(token: str, body: EnterBody, request: Request, response: Response, db: Session = Depends(get_db)):
    link = _link_or_404(db, token)
    agent = _agent(db, link)
    try:
        normalized = identity.normalize_phone(body.phone)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    existing = users_service.get_by_phone(db, storage_phone(link.id, normalized))
    result = _evaluate(db, link, agent, existing)
    if result.http_gone():
        return _gone()
    try:
        user = runtime.ensure_tester(db, link, body.name, body.phone)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    response.set_cookie(session.COOKIE_NAME, session.sign(link.id, user.id), **_cookie_kwargs(request, link))
    if not result.open:
        return runtime.session_payload(db, agent, link, user, result)
    runtime.live_or_create(db, agent, link, user)
    opened = _evaluate(db, link, agent, user)
    return runtime.session_payload(db, agent, link, user, opened)


@router.post("/{token}/reset")
def reset(token: str, request: Request, db: Session = Depends(get_db)):
    link = _link_or_404(db, token)
    agent = _agent(db, link)
    user = _user_from_cookie(db, request, link)
    if not user:
        raise HTTPException(status_code=401, detail="נדרשת הזדהות")
    result = _evaluate(db, link, agent, user)
    if result.http_gone():
        return _gone()
    if not result.open:
        return runtime.session_payload(db, agent, link, user, result)
    runtime.archive_and_reset(db, agent, link, user)
    opened = gate.evaluate(link=link, agent=agent, message_count=0)
    return runtime.session_payload(db, agent, link, user, opened)


@router.post("/{token}/messages")
async def send(token: str, body: SendBody, request: Request, db: Session = Depends(get_db)):
    link = _link_or_404(db, token)
    agent = _agent(db, link)
    user = _user_from_cookie(db, request, link)
    if not user:
        raise HTTPException(status_code=401, detail="נדרשת הזדהות")
    result = _evaluate(db, link, agent, user)
    if result.http_gone():
        return _gone()
    if not result.open:
        return runtime.session_payload(db, agent, link, user, result)
    if quota.would_exceed(link, 1):
        closed = gate.evaluate(link=link, agent=agent, message_count=1)
        return runtime.session_payload(db, agent, link, user, closed)
    if not await _rate_and_idemp(request, link, body.message_id):
        return {"accepted": True, "duplicate": True}

    conv = runtime.live_or_create(db, agent, link, user)
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="הודעה ריקה")
    await runtime.ingest_text(agent, link, user, conv, text, (body.reply_to or "").strip() or None)
    return {"accepted": True}


@router.post("/{token}/media")
async def send_media(
    token: str,
    request: Request,
    file: UploadFile = File(...),
    caption: str = Form(""),
    reply_to: str = Form(""),
    message_id: str = Form(...),
    db: Session = Depends(get_db),
):
    if not message_id or len(message_id) < 8 or len(message_id) > 80:
        raise HTTPException(status_code=400, detail="message_id לא תקין")
    link = _link_or_404(db, token)
    agent = _agent(db, link)
    user = _user_from_cookie(db, request, link)
    if not user:
        raise HTTPException(status_code=401, detail="נדרשת הזדהות")
    result = _evaluate(db, link, agent, user)
    if result.http_gone():
        return _gone()
    if not result.open:
        return runtime.session_payload(db, agent, link, user, result)
    if quota.would_exceed(link, 1):
        closed = gate.evaluate(link=link, agent=agent, message_count=1)
        return runtime.session_payload(db, agent, link, user, closed)
    if not await _rate_and_idemp(request, link, message_id):
        return {"accepted": True, "duplicate": True}

    mime = (file.content_type or "").split(";")[0].strip().lower()
    try:
        kind = pg_media.kind_from_mime(mime, file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    cap = pg_media.max_bytes_for(kind)
    data = await file.read(cap + 1)
    if not data:
        raise HTTPException(status_code=400, detail="קובץ ריק")
    pending = await pg_media.to_pending(
        link_id=link.id,
        user_id=user.id,
        data=data,
        mime=mime or "application/octet-stream",
        filename=file.filename,
        caption=caption,
        reply_to=(reply_to or "").strip() or None,
    )
    conv = runtime.live_or_create(db, agent, link, user)
    await runtime.ingest_pending(agent, user, conv, pending)
    return {
        "accepted": True,
        "message": {
            "id": message_id,
            "role": "user",
            "content": pending.text,
            "message_type": pending.msg_type,
            "media_url": pending.media_url,
            "media_too_large": pending.media_too_large,
            "reply_to": pending.reply_to_text,
        },
    }


async def _rate_and_idemp(request: Request, link, message_id: str) -> bool:
    ip = _client_ip(request)
    if not await limits.allow(f"pg:rl:ip:{ip}", 40):
        raise HTTPException(status_code=429, detail="נסה שוב בעוד רגע")
    if not await limits.allow(f"pg:rl:tok:{link.id}", 60):
        raise HTTPException(status_code=429, detail="נסה שוב בעוד רגע")
    return await limits.once(f"pg:idemp:{link.id}:{message_id}")


@router.get("/{token}/events")
async def events(token: str, request: Request, db: Session = Depends(get_db)):
    link = _link_or_404(db, token)
    agent = _agent(db, link)
    user = _user_from_cookie(db, request, link)
    if not user:
        raise HTTPException(status_code=401, detail="נדרשת הזדהות")
    result = _evaluate(db, link, agent, user)
    if result.http_gone():
        return _gone()
    conv = repo.live_conversation(db, link.id, user.id)
    if not conv:
        raise HTTPException(status_code=404, detail="אין שיחה")
    last_id = request.headers.get("last-event-id") or request.query_params.get("after") or "$"
    conv_id = conv.id

    async def gen():
        async for event_id, payload in streams.iterate(conv_id, last_id):
            if await request.is_disconnected():
                break
            if payload is None:
                yield "event: ping\ndata: {}\n\n"
                continue
            yield f"id: {event_id}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
