"""People an agent answers when its reply list is on. Off ignores this table."""
from sqlalchemy.orm import Session

from backend.models.reply_person import ReplyPerson
from backend.services.silence.phones import canonical

NAME_MAX = 80
NOTE_MAX = 2000
PEOPLE_MAX = 500
PAGE_SIZE = 50


def contains(db: Session, agent_id: int, raw: str) -> bool:
    number = canonical(raw)
    if not number:
        return False
    row = (
        db.query(ReplyPerson.id)
        .filter(ReplyPerson.agent_id == agent_id, ReplyPerson.phone == number)
        .first()
    )
    return row is not None


def find(db: Session, agent_id: int, raw: str) -> ReplyPerson | None:
    number = canonical(raw)
    if not number:
        return None
    return (
        db.query(ReplyPerson)
        .filter(ReplyPerson.agent_id == agent_id, ReplyPerson.phone == number)
        .first()
    )


def page(db: Session, agent_id: int, page_number: int) -> dict:
    page_number = max(page_number, 1)
    query = db.query(ReplyPerson).filter(ReplyPerson.agent_id == agent_id)
    total = query.count()
    rows = (
        query.order_by(ReplyPerson.name, ReplyPerson.phone)
        .offset((page_number - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .all()
    )
    return {
        "items": [_row(row) for row in rows],
        "total": total,
        "page": page_number,
        "page_size": PAGE_SIZE,
    }


def add(db: Session, agent_id: int, raw: str, name: str, note: str) -> ReplyPerson:
    number = _phone(raw)
    label, text = _profile(name, note)
    if find(db, agent_id, number) is not None:
        raise ValueError("המספר כבר ברשימה")
    _room(db, agent_id, 1)
    row = ReplyPerson(agent_id=agent_id, phone=number, name=label, note=text)
    db.add(row)
    db.flush()
    return row


def update(
    db: Session, agent_id: int, raw: str, name: str, note: str, new_phone: str | None,
) -> ReplyPerson:
    row = find(db, agent_id, raw)
    if row is None:
        raise ValueError("האדם לא ברשימה")
    label, text = _profile(name, note)
    number = _phone(new_phone if new_phone else row.phone)
    if number != row.phone and find(db, agent_id, number) is not None:
        raise ValueError("המספר כבר ברשימה")
    row.phone = number
    row.name = label
    row.note = text
    db.flush()
    return row


def remove_many(db: Session, agent, raw_phones: list[str]) -> None:
    numbers = _numbers(raw_phones)
    if not numbers:
        return
    (
        db.query(ReplyPerson)
        .filter(ReplyPerson.agent_id == agent.id, ReplyPerson.phone.in_(numbers))
        .delete(synchronize_session=False)
    )
    _close_if_empty(db, agent)


def remove_all(db: Session, agent) -> None:
    (
        db.query(ReplyPerson)
        .filter(ReplyPerson.agent_id == agent.id)
        .delete(synchronize_session=False)
    )
    agent.reply_list_enabled = False


def set_enabled(db: Session, agent, enabled: bool) -> None:
    if enabled and _count(db, agent.id) == 0:
        raise ValueError("אי אפשר להדליק רשימה ריקה")
    agent.reply_list_enabled = enabled


def _close_if_empty(db: Session, agent) -> None:
    if agent.reply_list_enabled and _count(db, agent.id) == 0:
        agent.reply_list_enabled = False


def _count(db: Session, agent_id: int) -> int:
    return db.query(ReplyPerson.id).filter(ReplyPerson.agent_id == agent_id).count()


def _room(db: Session, agent_id: int, incoming: int) -> None:
    if _count(db, agent_id) + incoming > PEOPLE_MAX:
        raise ValueError("אפשר עד 500 אנשים")


def _numbers(raw_phones: list[str]) -> list[str]:
    seen: list[str] = []
    for raw in raw_phones:
        number = canonical(raw)
        if number and number not in seen:
            seen.append(number)
    if len(seen) > PEOPLE_MAX:
        raise ValueError("אפשר עד 500 אנשים")
    return seen


def _phone(raw: str) -> str:
    number = canonical(raw)
    if not number:
        raise ValueError("מספר לא תקין")
    return number


def _profile(name: str, note: str) -> tuple[str, str]:
    label = " ".join((name or "").split())
    text = (note or "").strip()
    if not label:
        raise ValueError("חסר שם")
    if len(label) > NAME_MAX:
        raise ValueError("השם ארוך מדי")
    if len(text) > NOTE_MAX:
        raise ValueError("ההנחיה ארוכה מדי")
    return label, text


def _row(row: ReplyPerson) -> dict:
    return {"phone": row.phone, "name": row.name, "note": row.note}
