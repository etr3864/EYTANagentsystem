"""Send-row transitions. The lease is the only recovery if a worker dies."""
from datetime import datetime, timedelta

from sqlalchemy import text
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


def _inside_window(campaign, sent_at: datetime, now: datetime) -> bool:
    amount = campaign.reply_window_amount or 7
    if campaign.reply_window_unit == "hours":
        return now <= sent_at + timedelta(hours=amount)
    return now <= sent_at + timedelta(days=amount)


def catch_up_replies(db, campaign) -> None:
    """Past replies on a finished campaign. A live message is counted when it arrives."""
    if campaign.status != C.FINISHED:
        return
    unit = "hour" if campaign.reply_window_unit == "hours" else "day"
    found = db.execute(text(f"""
        SELECT r.id, MIN(m.created_at) AS first_at
        FROM campaign_recipients r
        JOIN (
            SELECT recipient_id, MIN(sent_at) AS sent_at
            FROM campaign_sends
            WHERE status = 'sent' AND sent_at IS NOT NULL
            GROUP BY recipient_id
        ) s ON s.recipient_id = r.id
        JOIN users u ON u.phone = r.phone
        JOIN conversations c
          ON c.user_id = u.id AND c.agent_id = :agent AND c.playground_link_id IS NULL
        JOIN messages m
          ON m.conversation_id = c.id AND m.role = 'user'
         AND m.created_at > s.sent_at
         AND m.created_at <= s.sent_at + (:amount * INTERVAL '1 {unit}')
        WHERE r.campaign_id = :cid AND r.replied_at IS NULL
        GROUP BY r.id
    """), {
        "agent": campaign.agent_id,
        "cid": campaign.id,
        "amount": campaign.reply_window_amount or 7,
    }).all()
    if not found:
        return
    for recipient_id, first_at in found:
        db.query(CampaignRecipient).filter(CampaignRecipient.id == recipient_id).update(
            {"replied_at": first_at},
            synchronize_session=False,
        )
    campaign.replied_count = (
        db.query(CampaignRecipient.id)
        .filter(CampaignRecipient.campaign_id == campaign.id, CampaignRecipient.replied_at.isnot(None))
        .count()
    )
    db.commit()


def note_reply(db: Session, agent_id: int | None, phone: str) -> None:
    number = canonical(phone)
    if not agent_id or not number:
        return
    rows = (
        db.query(CampaignRecipient, Campaign)
        .join(Campaign, Campaign.id == CampaignRecipient.campaign_id)
        .filter(
            Campaign.agent_id == agent_id,
            Campaign.status.in_((C.RUNNING, C.PAUSED, C.FINISHED)),
            CampaignRecipient.phone == number,
            CampaignRecipient.replied_at.is_(None),
        )
        .all()
    )
    now = datetime.utcnow()
    for recipient, campaign in rows:
        sent_at = (
            db.query(CampaignSend.sent_at)
            .filter(
                CampaignSend.recipient_id == recipient.id,
                CampaignSend.status == C.SENT,
                CampaignSend.sent_at.isnot(None),
                CampaignSend.sent_at < now,
            )
            .order_by(CampaignSend.sent_at.asc())
            .limit(1)
            .scalar()
        )
        if sent_at is None or not _inside_window(campaign, sent_at, now):
            continue
        recipient.replied_at = now
        campaign.replied_count = (campaign.replied_count or 0) + 1
        if campaign.status != C.FINISHED:
            db.query(CampaignSend).filter(
                CampaignSend.recipient_id == recipient.id,
                CampaignSend.status == C.PENDING,
            ).update(
                {"status": C.SKIPPED, "fail_reason": "replied"},
                synchronize_session=False,
            )
