"""Poke running campaigns. The worker reschedules itself; nothing sleeps here."""
from backend.celery_app import celery_app
from backend.core.database import SessionLocal
from backend.core.logger import log_error
from backend.services.campaigns.deliver import due_agent_ids, expire_leases, promote_due, send_one


@celery_app.task
def campaign_tick() -> None:
    db = SessionLocal()
    try:
        expire_leases(db)
        promote_due(db)
        db.commit()
        agent_ids = due_agent_ids(db)
    except Exception as error:
        log_error("campaign_tick", str(error)[:80])
        db.rollback()
        return
    finally:
        db.close()
    for agent_id in agent_ids:
        send_agent.delay(agent_id)


@celery_app.task
def send_agent(agent_id: int) -> None:
    db = SessionLocal()
    try:
        wait = send_one(db, agent_id)
    except Exception as error:
        log_error("campaign_send", str(error)[:80])
        db.rollback()
        return
    finally:
        db.close()
    if wait is not None and wait >= 0:
        send_agent.apply_async(args=[agent_id], countdown=max(1, int(wait)))
