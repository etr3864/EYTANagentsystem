"""Follow-up service for customer re-engagement.

Event-driven architecture using Redis sorted set as timer:
  Agent responds → ZADD timer → timer fires → eligibility check → AI evaluate → send

AI evaluation logic lives in followup_evaluator.py.
"""
from datetime import datetime, timedelta
from typing import Optional

import redis.asyncio as aioredis
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models.scheduled_followup import ScheduledFollowup
from backend.models.scheduled_reminder import ScheduledReminder
from backend.models.conversation import Conversation
from backend.models.whatsapp_template import WhatsAppTemplate
from backend.models.agent import Agent
from backend.models.message import Message
from backend.models.user import User
from backend.services import providers, messages
from backend.services import followup_evaluator
from backend.core.config import settings
from backend.core.logger import log, log_error
from backend.core.enums import FollowupStatus, ReminderStatus


BATCH_SIZE = 50
REDIS_KEY = "followup:timers"

DEFAULT_SEQUENCE = [{"delay_hours": 3, "instruction": ""}]

DEFAULT_CONFIG = {
    "enabled": False,
    "model": "claude-sonnet-4-5",
    "min_messages": 5,
    "active_hours": {"start": "09:00", "end": "21:00"},
    "meta_templates": [],
    "sequence": DEFAULT_SEQUENCE,
}


def get_config(agent: Agent) -> dict:
    """Get follow-up config with defaults. Migrates old format automatically."""
    import copy
    config = copy.deepcopy(DEFAULT_CONFIG)
    if agent.followup_config:
        saved = agent.followup_config
        config.update(saved)
        if "sequence" not in saved and "intervals_minutes" in saved:
            config["sequence"] = _migrate_old_config(saved)
    return config


def _migrate_old_config(saved: dict) -> list[dict]:
    """Convert old intervals_minutes config to sequence format."""
    intervals = saved.get("intervals_minutes", [120])
    inactivity = saved.get("inactivity_minutes", 120)
    instructions = saved.get("ai_instructions", "")
    sequence = []
    for i, interval_min in enumerate(intervals):
        delay_hours = (inactivity + interval_min) / 60 if i == 0 else interval_min / 60
        sequence.append({"delay_hours": round(delay_hours, 1), "instruction": instructions})
    return sequence or DEFAULT_SEQUENCE


# ──────────────────────────────────────────
# Redis timer management
# ──────────────────────────────────────────

_redis_pool: Optional[aioredis.Redis] = None


async def _get_redis() -> Optional[aioredis.Redis]:
    global _redis_pool
    if _redis_pool is None:
        try:
            _redis_pool = aioredis.from_url(
                settings.redis_url, encoding="utf-8", decode_responses=True,
            )
            await _redis_pool.ping()
        except Exception:
            _redis_pool = None
    return _redis_pool


def _timer_key(agent_id: int, conv_id: int) -> str:
    return f"{agent_id}:{conv_id}"


async def set_followup_timer(agent_id: int, conv_id: int, delay_hours: float) -> None:
    """Schedule a follow-up check after delay_hours."""
    r = await _get_redis()
    if not r:
        return
    fire_at = datetime.utcnow() + timedelta(hours=delay_hours)
    try:
        await r.zadd(REDIS_KEY, {_timer_key(agent_id, conv_id): fire_at.timestamp()})
    except Exception as e:
        log_error("followup_timer", f"ZADD failed: {str(e)[:50]}")


async def cancel_followup_timer(agent_id: int, conv_id: int) -> None:
    """Cancel a pending follow-up timer."""
    r = await _get_redis()
    if not r:
        return
    try:
        await r.zrem(REDIS_KEY, _timer_key(agent_id, conv_id))
    except Exception as e:
        log_error("followup_timer", f"ZREM failed: {str(e)[:50]}")


# ──────────────────────────────────────────
# Timer check: called by scheduler
# ──────────────────────────────────────────

async def check_followup_timers(db: Session) -> int:
    """Check Redis for matured timers, create followups for eligible ones."""
    r = await _get_redis()
    if not r:
        return 0

    now = datetime.utcnow()
    created = 0

    try:
        ready = await r.zrangebyscore(REDIS_KEY, 0, now.timestamp(), start=0, num=BATCH_SIZE)
    except Exception as e:
        log_error("followup_timer", f"ZRANGEBYSCORE failed: {str(e)[:50]}")
        return 0

    for key in ready:
        claimed = await _claim_timer(r, key)
        if not claimed:
            continue
        agent_id, conv_id = _parse_timer_key(key)
        if not agent_id:
            continue
        if _create_if_eligible(db, agent_id, conv_id, now):
            created += 1

    if created:
        log("followup", msg=f"scheduled {created} follow-ups from timers")
    return created


async def _claim_timer(r: aioredis.Redis, key: str) -> bool:
    """Atomically remove timer to claim it (prevents duplicate processing)."""
    try:
        return bool(await r.zrem(REDIS_KEY, key))
    except Exception:
        return False


def _parse_timer_key(key: str) -> tuple[int | None, int | None]:
    parts = key.split(":")
    if len(parts) != 2:
        return None, None
    try:
        return int(parts[0]), int(parts[1])
    except ValueError:
        return None, None


def _create_if_eligible(db: Session, agent_id: int, conv_id: int, now: datetime) -> bool:
    """Check eligibility and create a scheduled followup if conditions are met."""
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.is_active == True).first()
    if not agent:
        return False

    config = get_config(agent)
    if not config["enabled"]:
        return False

    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv or conv.opted_out or conv.is_paused:
        return False

    if not conv.last_customer_message_at:
        return False

    sequence = config.get("sequence", DEFAULT_SEQUENCE)
    step = _get_current_step(db, conv, sequence)
    if step is None:
        return False

    # min_messages only applies to the first step (subsequent steps = sequence already committed)
    if step == 0 and not _has_enough_messages(db, conv, config.get("min_messages", 5)):
        return False

    if _has_pending_followup(db, conv_id):
        return False

    if _has_pending_reminder(db, conv.user_id, agent_id):
        return False

    return _schedule_followup(db, conv, agent, config, sequence, step, now)


def _get_current_step(db: Session, conv: Conversation, sequence: list[dict]) -> Optional[int]:
    """Determine which sequence step to schedule (0-indexed). None if sequence exhausted."""
    sent_since = db.query(func.count(ScheduledFollowup.id)).filter(
        ScheduledFollowup.conversation_id == conv.id,
        ScheduledFollowup.status == FollowupStatus.SENT,
        ScheduledFollowup.sent_at > conv.last_customer_message_at,
    ).scalar() or 0
    if sent_since >= len(sequence):
        return None
    return sent_since


def _has_enough_messages(db: Session, conv: Conversation, min_messages: int) -> bool:
    """Check if enough messages were exchanged since the customer last re-engaged.

    Cutoff = the later of: last_customer_message_at or last sent follow-up
    (only if the follow-up was sent AFTER the customer's last message).
    """
    cutoff = conv.last_customer_message_at
    last_sent_fu = db.query(ScheduledFollowup.sent_at).filter(
        ScheduledFollowup.conversation_id == conv.id,
        ScheduledFollowup.status == FollowupStatus.SENT,
        ScheduledFollowup.sent_at > conv.last_customer_message_at,
    ).order_by(ScheduledFollowup.sent_at.desc()).first()

    if last_sent_fu and last_sent_fu.sent_at:
        cutoff = last_sent_fu.sent_at

    count = db.query(func.count(Message.id)).filter(
        Message.conversation_id == conv.id,
        Message.created_at > cutoff,
    ).scalar() or 0
    return count >= min_messages


def _has_pending_followup(db: Session, conv_id: int) -> bool:
    return db.query(ScheduledFollowup.id).filter(
        ScheduledFollowup.conversation_id == conv_id,
        ScheduledFollowup.status.in_([FollowupStatus.PENDING, FollowupStatus.EVALUATING]),
    ).first() is not None


def _has_pending_reminder(db: Session, user_id: int, agent_id: int) -> bool:
    return db.query(ScheduledReminder.id).filter(
        ScheduledReminder.agent_id == agent_id,
        ScheduledReminder.user_id == user_id,
        ScheduledReminder.status == ReminderStatus.PENDING,
    ).first() is not None


def _schedule_followup(
    db: Session, conv: Conversation, agent: Agent, config: dict,
    sequence: list[dict], step: int, now: datetime,
) -> bool:
    """Create a scheduled follow-up record for the given step."""
    step_config = sequence[step]
    scheduled_for = _clamp_to_active_hours(now, config.get("active_hours", {}))

    try:
        db.add(ScheduledFollowup(
            conversation_id=conv.id,
            agent_id=agent.id,
            user_id=conv.user_id,
            followup_number=step + 1,
            step_instruction=step_config.get("instruction", ""),
            scheduled_for=scheduled_for,
        ))
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


def _clamp_to_active_hours(dt: datetime, active_hours: dict) -> datetime:
    """Push datetime into allowed active hours window."""
    from backend.core.timezone import from_utc, to_utc, DEFAULT_TZ

    start_str = active_hours.get("start", "09:00")
    end_str = active_hours.get("end", "21:00")

    try:
        start_h, start_m = map(int, start_str.split(":"))
        end_h, end_m = map(int, end_str.split(":"))
    except (ValueError, AttributeError):
        return dt

    local = from_utc(dt, DEFAULT_TZ)
    local_start = local.replace(hour=start_h, minute=start_m, second=0, microsecond=0)
    local_end = local.replace(hour=end_h, minute=end_m, second=0, microsecond=0)

    crosses_midnight = local_end <= local_start

    if crosses_midnight:
        in_window = local >= local_start or local < local_end
    else:
        in_window = local_start <= local < local_end

    if in_window:
        return dt

    if local < local_start:
        clamped = local_start
    else:
        clamped = local_start + timedelta(days=1)

    return to_utc(clamped.replace(tzinfo=None), DEFAULT_TZ)


# ──────────────────────────────────────────
# Process: evaluate with AI and send
# ──────────────────────────────────────────

async def process_pending_followups(db: Session) -> int:
    """Process follow-ups that are due. Returns count processed."""
    import asyncio
    from backend.core.database import SessionLocal

    MAX_CONCURRENT = 10
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)

    now = datetime.utcnow()
    processed = 0
    max_iterations = 20

    for _ in range(max_iterations):
        pending = db.query(ScheduledFollowup).filter(
            ScheduledFollowup.status == FollowupStatus.PENDING,
            ScheduledFollowup.scheduled_for <= now,
        ).limit(BATCH_SIZE).all()

        if not pending:
            break

        fu_ids = []
        for fu in pending:
            fu.status = FollowupStatus.EVALUATING
            fu_ids.append(fu.id)
        db.commit()

        async def _run(followup_id: int) -> bool:
            async with semaphore:
                local_db = SessionLocal()
                try:
                    fu = local_db.query(ScheduledFollowup).filter(
                        ScheduledFollowup.id == followup_id,
                    ).first()
                    if not fu:
                        return False
                    await _process_single(local_db, fu)
                    local_db.commit()
                    return True
                except Exception as e:
                    local_db.rollback()
                    _mark_failed(local_db, followup_id, str(e))
                    log_error("followup", f"processing failed: {str(e)[:50]}")
                    return False
                finally:
                    local_db.close()

        results = await asyncio.gather(*[_run(fid) for fid in fu_ids])
        processed += sum(1 for r in results if r)
        db.expire_all()

        if len(pending) < BATCH_SIZE:
            break
        await asyncio.sleep(1)

    if processed:
        log("followup", msg=f"processed {processed} follow-ups")
    return processed


def _mark_failed(db: Session, followup_id: int, error: str) -> None:
    """Mark a followup as SKIPPED after a processing error."""
    try:
        fu = db.query(ScheduledFollowup).filter(ScheduledFollowup.id == followup_id).first()
        if fu:
            fu.status = FollowupStatus.SKIPPED
            fu.ai_reason = f"error: {error[:200]}"
            db.commit()
    except Exception:
        db.rollback()
        log_error("followup", f"failed to mark followup {followup_id} as skipped")


async def _process_single(db: Session, fu: ScheduledFollowup) -> None:
    """Evaluate and potentially send a single follow-up."""
    conv = db.query(Conversation).filter(Conversation.id == fu.conversation_id).first()
    agent = db.query(Agent).filter(Agent.id == fu.agent_id).first()
    user = db.query(User).filter(User.id == fu.user_id).first()

    if not conv or not agent or not user:
        _skip(fu, "missing conversation, agent, or user")
        return

    if conv.opted_out or conv.is_paused or not agent.is_active:
        fu.status = FollowupStatus.CANCELLED
        return

    if conv.last_customer_message_at and conv.last_customer_message_at > fu.created_at:
        fu.status = FollowupStatus.CANCELLED
        return

    config = get_config(agent)
    needs_template = _needs_meta_template(agent, conv)

    if needs_template and not config.get("meta_templates"):
        _skip(fu, "meta provider after 24h but no templates configured")
        return

    decision = await followup_evaluator.evaluate(db, fu, agent, user, config, needs_template, conv.id)

    if not decision.get("send"):
        _skip(fu, decision.get("reason", "AI decided not to send"))
        return

    success, err = await _send(db, fu, conv, agent, user, decision, needs_template)
    if success:
        fu.status = FollowupStatus.SENT
        fu.sent_at = datetime.utcnow()
        fu.content = decision.get("content", "")
        sequence = config.get("sequence", DEFAULT_SEQUENCE)
        next_step = fu.followup_number  # followup_number is 1-indexed, so this is already the next 0-indexed step
        if next_step < len(sequence):
            await set_followup_timer(agent.id, conv.id, sequence[next_step]["delay_hours"])
    else:
        _skip(fu, err or "send failed")


def _needs_meta_template(agent: Agent, conv: Conversation) -> bool:
    if agent.provider != "meta":
        return False
    if not conv.last_customer_message_at:
        return True
    hours_since = (datetime.utcnow() - conv.last_customer_message_at).total_seconds() / 3600
    return hours_since > 24


def _skip(fu: ScheduledFollowup, reason: str) -> None:
    fu.status = FollowupStatus.SKIPPED
    fu.ai_reason = reason[:500]


# ──────────────────────────────────────────
# Send
# ──────────────────────────────────────────

async def _send(
    db: Session, fu: ScheduledFollowup, conv: Conversation,
    agent: Agent, user: User, decision: dict, needs_template: bool
) -> tuple[bool, str | None]:
    if not user.phone:
        return False, "no customer phone"

    if needs_template:
        return await _send_as_template(db, fu, conv, agent, user, decision)
    else:
        return await _send_as_freetext(db, fu, conv, agent, user, decision)


async def _send_as_freetext(
    db: Session, fu: ScheduledFollowup, conv: Conversation,
    agent: Agent, user: User, decision: dict
) -> tuple[bool, str | None]:
    content = decision.get("content", "")
    if not content:
        return False, "AI returned empty content"

    sent = await providers.send_message(agent, user.phone, content)
    if not sent:
        return False, "whatsapp send failed"

    messages.add(db, conv.id, "assistant", content, message_type="followup")
    fu.sent_via = "free_text"
    log("followup", msg=f"sent #{fu.followup_number} to {user.phone[:6]}...")
    return True, None


async def _send_as_template(
    db: Session, fu: ScheduledFollowup, conv: Conversation,
    agent: Agent, user: User, decision: dict
) -> tuple[bool, str | None]:
    template_name = decision.get("template_name", "")
    language = decision.get("template_language", "he")
    params = decision.get("template_params", [])

    if not template_name:
        return False, "AI did not select a template"

    tpl = db.query(WhatsAppTemplate).filter(
        WhatsAppTemplate.agent_id == agent.id,
        WhatsAppTemplate.name == template_name,
        WhatsAppTemplate.language == language,
        WhatsAppTemplate.status == "APPROVED",
    ).first()

    if not tpl:
        return False, f"template '{template_name}' not found or not approved"

    components = []
    if params:
        components = [{
            "type": "body",
            "parameters": [{"type": "text", "text": str(p)} for p in params],
        }]

    sent = await providers.send_template(
        agent, user.phone, template_name, language, components,
    )
    if not sent:
        return False, "meta template send failed"

    summary = f"[follow-up template: {template_name}]"
    messages.add(db, conv.id, "assistant", summary, message_type="followup")
    fu.sent_via = "meta_template"
    fu.template_name = template_name
    log("followup", msg=f"template '{template_name}' sent #{fu.followup_number} to {user.phone[:6]}...")
    return True, None


# ──────────────────────────────────────────
# Cancel
# ──────────────────────────────────────────

def cancel_pending_followups(db: Session, conversation_id: int) -> int:
    """Cancel all pending follow-ups for a conversation. Returns count cancelled."""
    count = db.query(ScheduledFollowup).filter(
        ScheduledFollowup.conversation_id == conversation_id,
        ScheduledFollowup.status.in_([FollowupStatus.PENDING, FollowupStatus.EVALUATING]),
    ).update({"status": FollowupStatus.CANCELLED}, synchronize_session="fetch")
    return count
