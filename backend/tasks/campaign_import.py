"""Background audience insert. The HTTP request only stores the file."""
from backend.celery_app import celery_app
from backend.core.database import SessionLocal
from backend.core.logger import log_error
from backend.models.campaign import Campaign, CampaignImport, CampaignRecipient
from backend.services.campaigns import audience
from backend.services.campaigns.constants import DRAFT


@celery_app.task
def run_import(import_id: int) -> None:
    db = SessionLocal()
    try:
        job = db.get(CampaignImport, import_id)
        if job is None or not job.payload or not job.phone_column:
            return
        campaign = db.get(Campaign, job.campaign_id)
        if campaign is None or campaign.status != DRAFT:
            job.status = "failed"
            job.error = "not_draft"
            db.commit()
            return
        _replace(db, job, campaign)
    except Exception as error:
        log_error("campaign_import", str(error)[:80])
        db.rollback()
        _fail(import_id, str(error)[:80])
    finally:
        db.close()


def _replace(db, job, campaign) -> None:
    headers, rows = audience.read_table(job.filename, job.payload)
    if job.phone_column not in headers:
        raise ValueError("phone_column")
    kept, _invalid = audience.recipients(rows, job.phone_column)
    db.query(CampaignRecipient).filter(CampaignRecipient.campaign_id == campaign.id).delete()
    for row in kept:
        db.add(CampaignRecipient(
            campaign_id=campaign.id,
            phone=row["phone"],
            fields=row["fields"],
            sort_order=row["sort_order"],
        ))
    campaign.recipient_count = len(kept)
    job.status = "done"
    job.payload = None
    job.error = None
    db.commit()


def _fail(import_id: int, message: str) -> None:
    db = SessionLocal()
    try:
        job = db.get(CampaignImport, import_id)
        if job is None:
            return
        job.status = "failed"
        job.error = message
        job.payload = None
        db.commit()
    finally:
        db.close()
