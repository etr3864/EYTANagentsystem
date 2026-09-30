"""One claimed send. Compose stays outside the Wasender lock."""
import asyncio
from datetime import datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.core.encryption import decrypt_credentials
from backend.models.agent import Agent
from backend.models.campaign import Campaign, CampaignRecipient, CampaignSend, CampaignStep
from backend.services.campaigns import caps, compose, constants as C, gates, records, session_lock
from backend.services.campaigns.chat import store_outbound
from backend.services.channels.agent_channels import get_channel_by_type
from backend.services.channels import wasender
from backend.services.llm.capacity import is_capacity_error


def promote_due(db: Session) -> None:
    now = datetime.utcnow()
    db.query(Campaign).filter(
        Campaign.status == C.SCHEDULED,
        Campaign.starts_at.is_not(None),
        Campaign.starts_at <= now,
    ).update({"status": C.RUNNING}, synchronize_session=False)


def due_agent_ids(db: Session) -> list[int]:
    rows = db.execute(text("""
        SELECT DISTINCT s.agent_id
        FROM campaign_sends s
        JOIN campaigns c ON c.id = s.campaign_id
        WHERE c.status = 'running'
          AND s.status = 'pending'
          AND s.next_send_at <= NOW()
    """)).all()
    return [row[0] for row in rows]


def expire_leases(db: Session) -> None:
    now = datetime.utcnow()
    rows = (
        db.query(CampaignSend)
        .filter(CampaignSend.status == C.SENDING, CampaignSend.locked_until < now)
        .all()
    )
    for send in rows:
        records.expire_if_due(send, now)


def send_one(db: Session, agent_id: int) -> float | None:
    now = datetime.utcnow()
    send = _claim(db, agent_id, now)
    if send is None:
        return None
    campaign = db.get(Campaign, send.campaign_id)
    agent = db.get(Agent, agent_id)
    recipient = db.get(CampaignRecipient, send.recipient_id)
    channel = get_channel_by_type(db, agent_id, "whatsapp_wasender") if agent else None
    decision = gates.decide(db, agent, campaign, recipient, channel, now)
    if decision.action != "send":
        return _hold(db, send, campaign, agent_id, decision, now)
    if not caps.hour_open(agent_id, agent.campaign_timezone, agent.campaign_hourly_cap, now):
        send.status = C.PENDING
        send.locked_until = None
        send.next_send_at = _next_hour(now)
        db.commit()
        return 60
    step = _step(db, campaign.id, send.step_position)
    try:
        body, _usage = asyncio.run(compose.compose(db, agent, campaign, step, recipient.fields or {}))
    except Exception as error:
        return _compose_failed(db, send, error, now)
    if not body:
        return _finish(db, send, C.FAILED, "empty")
    if session_lock.live_waiting(channel.id if channel else None):
        return _delay(db, send, now + timedelta(seconds=5))
    if not session_lock.try_send_lock(channel.id):
        return _delay(db, send, now + timedelta(seconds=5))
    try:
        outcome = asyncio.run(post_campaign(channel, recipient.phone, body, campaign))
    except RuntimeError as error:
        session_lock.release_send_lock(channel.id)
        if "CREDENTIALS_ENCRYPTION_KEY" in str(error):
            send.status = C.PENDING
            send.locked_until = None
            send.next_send_at = now + timedelta(minutes=10)
            _pause(db, agent_id, C.PAUSE_CONFIG)
            db.commit()
            return None
        raise
    finally:
        session_lock.release_send_lock(channel.id)
    return _after_http(db, send, campaign, agent, recipient, channel, body, outcome, now)


def _claim(db: Session, agent_id: int, now: datetime) -> CampaignSend | None:
    last = db.execute(text("""
        SELECT campaign_id FROM campaign_sends
        WHERE agent_id = :agent AND status = 'sent'
        ORDER BY sent_at DESC NULLS LAST
        LIMIT 1
    """), {"agent": agent_id}).scalar()
    send = db.execute(
        text("""
            SELECT s.id
            FROM campaign_sends s
            JOIN campaigns c ON c.id = s.campaign_id
            WHERE s.agent_id = :agent
              AND c.status = 'running'
              AND s.status = 'pending'
              AND s.next_send_at <= :now
            ORDER BY (s.campaign_id = :last), s.next_send_at, s.id
            FOR UPDATE OF s SKIP LOCKED
            LIMIT 1
        """),
        {"agent": agent_id, "now": now, "last": last or 0},
    ).scalar()
    if send is None:
        return None
    row = db.get(CampaignSend, send)
    row.status = C.SENDING
    row.locked_until = records.lease_until(now)
    row.attempt_count = (row.attempt_count or 0) + 1
    db.commit()
    return row


async def post_campaign(channel, phone: str, body: str, campaign):
    creds = decrypt_credentials(channel.credentials_encrypted)
    media_url = None
    if campaign.media_key:
        from backend.services.media.storage import get_public_url
        media_url = get_public_url(campaign.media_key)
    return await wasender.send_once(
        creds["api_key"],
        creds.get("session", "default"),
        phone,
        body,
        media_url=media_url,
        media_kind=campaign.media_kind,
        filename=campaign.media_name,
        timeout=C.HTTP_TIMEOUT,
    )


def _after_http(db, send, campaign, agent, recipient, channel, body, outcome, now) -> float:
    send.http_status = outcome.get("status")
    send.channel_id = channel.id
    if outcome.get("timed_out") or not outcome.get("msg_id"):
        if outcome.get("status") == 429:
            return _delay(db, send, now + timedelta(seconds=outcome.get("retry_after") or 30))
        if _session_error(outcome):
            _pause(db, agent.id, C.PAUSE_SESSION)
            return _delay(db, send, now + timedelta(minutes=5))
        if outcome.get("timed_out") or outcome.get("status") is None:
            send.status = C.UNCERTAIN
            send.fail_reason = (outcome.get("error") or "timeout")[:200]
            send.locked_until = None
            db.commit()
            return None
        return _finish(db, send, C.FAILED, outcome.get("error") or "http")
    send.status = C.SENT
    send.delivery = "sent"
    send.provider_msg_id = str(outcome["msg_id"])
    send.body = body
    send.sent_at = now
    send.locked_until = None
    send.hold_since = None
    if send.step_position == campaign.current_step:
        campaign.step_sent_count = (campaign.step_sent_count or 0) + 1
    caps.bump_hour(agent.id, agent.campaign_timezone, now)
    store_outbound(db, agent, campaign, recipient, body, channel, send.provider_msg_id)
    _advance(db, campaign)
    when = gates.pace_wait(now, agent.campaign_hourly_cap or 1)
    _defer_agent(db, agent.id, when, send.id)
    db.commit()
    from backend.services.campaigns.feed import publish
    publish(campaign.id)
    return (when - now).total_seconds()


def _hold(db, send, campaign, agent_id, decision, now) -> float | None:
    if decision.action == "pause" and decision.pause:
        _pause(db, agent_id, decision.pause)
        send.status = C.PENDING
        send.locked_until = None
        db.commit()
        return None
    if decision.action == "wait":
        return _delay(db, send, decision.when or now + timedelta(minutes=1))
    return _finish(db, send, decision.status or C.SKIPPED, decision.reason)


def _delay(db, send, when: datetime) -> float:
    send.status = C.PENDING
    send.locked_until = None
    send.next_send_at = when
    db.commit()
    return max(1.0, (when - datetime.utcnow()).total_seconds())


def _finish(db, send, status: str, reason: str | None) -> float | None:
    send.status = status
    send.fail_reason = (reason or "")[:200] or None
    send.locked_until = None
    db.commit()
    return 1


def _compose_failed(db, send, error: Exception, now: datetime) -> float | None:
    if is_capacity_error(error):
        send.hold_since = send.hold_since or now
        if (now - send.hold_since).total_seconds() > C.HOLD_LIMIT_SECONDS:
            return _finish(db, send, C.FAILED, "model_busy")
        return _delay(db, send, now + timedelta(seconds=60))
    detail = str(error).split("\n", 1)[0][:160]
    if "Event loop is closed" in detail and (send.attempt_count or 0) < 2:
        return _delay(db, send, now + timedelta(seconds=5))
    if "Event loop is closed" in detail:
        return _finish(db, send, C.FAILED, "event_loop")
    return _finish(db, send, C.FAILED, detail or "compose")


def _pause(db, agent_id: int, reason: str) -> None:
    db.query(Campaign).filter(
        Campaign.agent_id == agent_id,
        Campaign.status == C.RUNNING,
    ).update({"status": C.PAUSED, "pause_reason": reason}, synchronize_session=False)


def _defer_agent(db, agent_id: int, when: datetime, keep_id: int) -> None:
    db.query(CampaignSend).filter(
        CampaignSend.agent_id == agent_id,
        CampaignSend.status == C.PENDING,
        CampaignSend.id != keep_id,
        CampaignSend.next_send_at < when,
    ).update({"next_send_at": when}, synchronize_session=False)


def _step(db, campaign_id: int, position: int) -> CampaignStep | None:
    return (
        db.query(CampaignStep)
        .filter(CampaignStep.campaign_id == campaign_id, CampaignStep.position == position)
        .first()
    )


def _advance(db, campaign: Campaign) -> None:
    open_rows = (
        db.query(CampaignSend.id)
        .filter(
            CampaignSend.campaign_id == campaign.id,
            CampaignSend.step_position == campaign.current_step,
            CampaignSend.status.in_((C.PENDING, C.SENDING)),
        )
        .first()
    )
    if open_rows is not None:
        return
    nxt = (
        db.query(CampaignStep)
        .filter(CampaignStep.campaign_id == campaign.id, CampaignStep.position == campaign.current_step + 1)
        .first()
    )
    if nxt is None:
        campaign.status = C.FINISHED
        return
    campaign.current_step = nxt.position
    campaign.step_sent_count = 0
    from backend.services.campaigns.queue import enqueue_step
    enqueue_step(db, campaign, nxt.position)


def _session_error(outcome: dict) -> bool:
    if outcome.get("status") in (401, 403):
        return True
    text_error = (outcome.get("error") or "").lower()
    return "not connected" in text_error or "session" in text_error and "connect" in text_error


def _next_hour(now: datetime) -> datetime:
    return now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
