"""Excel export builder for conversation data.

Query strategy: batch by conversation IDs to avoid a single giant JOIN.
Keeps memory bounded and lets the DB use indexes efficiently.
"""
import io
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.core.enums import AppointmentStatus, FollowupStatus
from backend.models.agent import Agent
from backend.models.appointment import Appointment
from backend.models.conversation import Conversation
from backend.models.conversation_summary import ConversationSummary
from backend.models.message import Message
from backend.models.scheduled_followup import ScheduledFollowup
from backend.models.user import User

MAX_EXPORT_CONVERSATIONS = 4000
_BATCH_SIZE = 100

_HEADER_FONT = Font(bold=True, color="FFFFFF")
_HEADER_FILL = PatternFill("solid", fgColor="3B0764")


def build_export(
    db: Session,
    agent_id: int,
    from_date: str,
    to_date: str,
) -> tuple[io.BytesIO, str]:
    """Build and return Excel workbook as BytesIO + filename.

    Raises ValueError for invalid agent or over-limit results.
    """
    agent = db.get(Agent, agent_id)
    if not agent:
        raise ValueError("Agent not found")

    start_dt, end_dt = _parse_date_range(from_date, to_date)
    conv_rows = _fetch_conversations(db, agent_id, start_dt, end_dt)

    if len(conv_rows) > MAX_EXPORT_CONVERSATIONS:
        raise ValueError(
            f"יש {len(conv_rows):,} שיחות בטווח זה. "
            f"ניתן לייצא עד {MAX_EXPORT_CONVERSATIONS:,} שיחות בפעם אחת."
        )

    wb = Workbook()
    _build_summary_sheet(wb, agent.name, from_date, to_date, len(conv_rows))
    _build_conversations_sheet(wb, db, agent.name, conv_rows)

    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer, _make_filename(agent.name, from_date, to_date)


# ── Date helpers ──────────────────────────────────────────────────────────────


def _parse_date_range(from_date: str, to_date: str) -> tuple[datetime, datetime]:
    start = datetime.strptime(from_date, "%Y-%m-%d")
    end = datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    return start, end


def _fmt_date(iso: str) -> str:
    return datetime.strptime(iso, "%Y-%m-%d").strftime("%d/%m/%Y")


def _make_filename(agent_name: str, from_date: str, to_date: str) -> str:
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in agent_name)
    return f"conversations_{safe}_{from_date}_to_{to_date}.xlsx"


# ── DB queries ────────────────────────────────────────────────────────────────


def _fetch_conversations(
    db: Session, agent_id: int, start_dt: datetime, end_dt: datetime
) -> list[tuple[int, datetime, int]]:
    """Return (conv_id, created_at, user_id) ordered by created_at."""
    return (
        db.query(Conversation.id, Conversation.created_at, Conversation.user_id)
        .filter(
            Conversation.agent_id == agent_id,
            Conversation.created_at >= start_dt,
            Conversation.created_at <= end_dt,
        )
        .order_by(Conversation.created_at)
        .limit(MAX_EXPORT_CONVERSATIONS + 1)
        .all()
    )


# ── Sheet builders ────────────────────────────────────────────────────────────


def _build_summary_sheet(
    wb: Workbook,
    agent_name: str,
    from_date: str,
    to_date: str,
    total: int,
) -> None:
    ws = wb.active
    ws.title = "Summary"

    rows = [
        ("Agent", agent_name),
        ("Date Range", f"{_fmt_date(from_date)} – {_fmt_date(to_date)}"),
        ("Total Conversations", total),
        ("Exported At", datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")),
    ]
    for i, (label, value) in enumerate(rows, start=1):
        ws.cell(row=i, column=1, value=label).font = Font(bold=True)
        ws.cell(row=i, column=2, value=value)

    ws.column_dimensions["A"].width = 22
    ws.column_dimensions["B"].width = 40


def _build_conversations_sheet(
    wb: Workbook,
    db: Session,
    agent_name: str,
    conv_rows: list[tuple[int, datetime, int]],
) -> None:
    ws = wb.create_sheet("Conversations")
    _write_header(ws)

    user_cache: dict[int, User] = {}

    for batch_start in range(0, len(conv_rows), _BATCH_SIZE):
        batch = conv_rows[batch_start : batch_start + _BATCH_SIZE]
        _write_batch(ws, db, agent_name, batch, batch_start, user_cache)

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = "A1:H1"


def _write_header(ws) -> None:
    headers = [
        "Agent", "Customer Name", "Phone", "Opened At",
        "Messages", "Appointment Booked", "Conversation", "AI Summary",
    ]
    col_widths = [20, 20, 18, 20, 10, 18, 70, 40]

    for col, header in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.font = _HEADER_FONT
        cell.fill = _HEADER_FILL
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for col, width in enumerate(col_widths, start=1):
        ws.column_dimensions[ws.cell(row=1, column=col).column_letter].width = width


def _write_batch(
    ws,
    db: Session,
    agent_name: str,
    batch: list[tuple[int, datetime, int]],
    batch_start: int,
    user_cache: dict[int, User],
) -> None:
    conv_ids = [r[0] for r in batch]
    user_ids = list({r[2] for r in batch})

    _cache_users(db, user_ids, user_cache)
    messages_by_conv = _load_messages(db, conv_ids)
    followups_by_conv = _load_followups(db, conv_ids)
    summaries_by_conv = _load_summaries(db, conv_ids)
    users_with_appointments = _load_appointment_user_ids(db, user_ids)

    for offset, (conv_id, created_at, user_id) in enumerate(batch):
        row_idx = batch_start + offset + 2  # +1 header, +1 1-indexed

        user = user_cache.get(user_id)
        messages = messages_by_conv.get(conv_id, [])
        followups = followups_by_conv.get(conv_id, [])

        data = [
            agent_name,
            (user.name or "") if user else "",
            user.phone if user else "",
            created_at.strftime("%Y-%m-%d %H:%M"),
            len(messages),
            "Yes" if user_id in users_with_appointments else "No",
            _format_conversation(messages, followups),
            summaries_by_conv.get(conv_id, ""),
        ]
        for col, value in enumerate(data, start=1):
            cell = ws.cell(row=row_idx, column=col, value=value)
            wrap = col in (7, 8)
            cell.alignment = Alignment(wrap_text=wrap, vertical="top")


# ── Bulk loaders ──────────────────────────────────────────────────────────────


def _cache_users(db: Session, user_ids: list[int], cache: dict[int, User]) -> None:
    missing = [uid for uid in user_ids if uid not in cache]
    if missing:
        for u in db.query(User).filter(User.id.in_(missing)).all():
            cache[u.id] = u


def _load_messages(
    db: Session, conv_ids: list[int]
) -> dict[int, list[Message]]:
    messages = (
        db.query(Message)
        .filter(Message.conversation_id.in_(conv_ids))
        .order_by(Message.conversation_id, Message.created_at)
        .all()
    )
    result: dict[int, list[Message]] = {}
    for msg in messages:
        result.setdefault(msg.conversation_id, []).append(msg)
    return result


def _load_followups(
    db: Session, conv_ids: list[int]
) -> dict[int, list[ScheduledFollowup]]:
    followups = (
        db.query(ScheduledFollowup)
        .filter(
            ScheduledFollowup.conversation_id.in_(conv_ids),
            ScheduledFollowup.status == FollowupStatus.SENT,
            ScheduledFollowup.content.isnot(None),
            ScheduledFollowup.sent_at.isnot(None),
        )
        .order_by(ScheduledFollowup.conversation_id, ScheduledFollowup.sent_at)
        .all()
    )
    result: dict[int, list[ScheduledFollowup]] = {}
    for fu in followups:
        result.setdefault(fu.conversation_id, []).append(fu)
    return result


def _load_summaries(db: Session, conv_ids: list[int]) -> dict[int, str]:
    subq = (
        db.query(
            ConversationSummary.conversation_id,
            func.max(ConversationSummary.created_at).label("max_created"),
        )
        .filter(ConversationSummary.conversation_id.in_(conv_ids))
        .group_by(ConversationSummary.conversation_id)
        .subquery()
    )
    summaries = (
        db.query(ConversationSummary)
        .join(
            subq,
            (ConversationSummary.conversation_id == subq.c.conversation_id)
            & (ConversationSummary.created_at == subq.c.max_created),
        )
        .all()
    )
    return {s.conversation_id: s.summary_text for s in summaries}


def _load_appointment_user_ids(db: Session, user_ids: list[int]) -> set[int]:
    rows = (
        db.query(Appointment.user_id)
        .filter(
            Appointment.user_id.in_(user_ids),
            Appointment.status == AppointmentStatus.SCHEDULED,
        )
        .distinct()
        .all()
    )
    return {row[0] for row in rows}


# ── Conversation formatting ───────────────────────────────────────────────────


def _format_conversation(
    messages: list[Message],
    followups: list[ScheduledFollowup],
) -> str:
    events: list[tuple[datetime, str]] = []

    for msg in messages:
        prefix = "customer" if msg.role == "user" else "agent"
        events.append((msg.created_at, f"{prefix}: {_format_content(msg)}"))

    for fu in followups:
        ts = fu.sent_at.strftime("%Y-%m-%d %H:%M")
        events.append((fu.sent_at, f"--- followup ({ts}) ---\nagent: {fu.content}"))

    events.sort(key=lambda x: x[0])
    return "\n".join(text for _, text in events)


def _format_content(msg: Message) -> str:
    mt = msg.message_type or "text"
    url = msg.media_url or ""

    if mt in ("voice", "audio"):
        return f"[voice message: {url}]" if url else "[voice message]"
    if mt in ("media", "image"):
        return f"[media: {url}]" if url else "[media]"
    return msg.content or ""
