"""Send-row transitions. The lease is the only recovery if a worker dies."""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.models.campaign import Campaign, CampaignRecipient, CampaignSend
from backend.services.campaigns import constants as C
from backend.services.silence.phones import canonical


def expire_if_due(send: CampaignSend, now: datetime) -> bool:
    if send.status != C.SENDING:
        return False
    if send.locked_until and send.locked_until > now:
        return False
    if send.provider_msg_id:
        return False
    send.status = C.UNCERTAIN
    send.fail_reason = "lease"
    send.locked_until = None
    return True


def delivery_rank(value: str | None) -> int:
    return C.DELIVERY_RANK.get(value, 0)


def apply_delivery(send: CampaignSend, delivery: str) -> bool:
    if delivery_rank(delivery) < delivery_rank(send.delivery):
        return False
    if send.delivery == delivery:
        return False
    send.delivery = delivery
    return True


def lease_until(now: datetime) -> datetime:
    return now + timedelta(seconds=C.LEASE_SECONDS)


def note_reply(db: Session, agent_id: int | None, phone: str) -> None:
    number = canonical(phone)
    if not agent_id or not number:
        return
    rows = (
        db.query(CampaignRecipient, Campaign)
        .join(Campaign, Campaign.id == CampaignRecipient.campaign_id)
        .filter(
            Campaign.agent_id == agent_id,
            Campaign.status.in_(C.OPEN_STATUSES),
            CampaignRecipient.phone == number,
            CampaignRecipient.replied_at.is_(None),
        )
        .all()
    )
    now = datetime.utcnow()
    for recipient, campaign in rows:
        recipient.replied_at = now
        campaign.replied_count = (campaign.replied_count or 0) + 1
        db.query(CampaignSend).filter(
            CampaignSend.recipient_id == recipient.id,
            CampaignSend.status == C.PENDING,
        ).update(
            {"status": C.SKIPPED, "fail_reason": "replied"},
            synchronize_session=False,
        )
