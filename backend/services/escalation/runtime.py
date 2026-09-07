from sqlalchemy.orm import Session

from backend.models.agent import Agent
from backend.services.entities import conversations, users
from backend.services.escalation import cooldown, note, payload, repo
from backend.services.escalation.constants import TOOL_OK, TOOL_COOLDOWN
from backend.services.escalation.present import parse_tool_name
from backend.services.escalation.staff_notify import send_staff
from backend.services.escalation.webhook import post_webhook


async def execute(
    db: Session,
    agent: Agent,
    user_id: int,
    conversation_id: int | None,
    tool: str,
    data: dict,
) -> str:
    reason_id = parse_tool_name(tool)
    if reason_id is None or not conversation_id:
        return "הכלי לא זמין"
    row = repo.get(db, agent.id, reason_id)
    if not row or not row.enabled:
        return "הכלי לא זמין"
    values, missing = payload.collect_values(row, data)
    if missing:
        return payload.missing_message(missing)
    if cooldown.is_cooling(db, conversation_id, row.id):
        return TOOL_COOLDOWN

    user = users.get_by_id(db, user_id)
    conv = conversations.get_by_id(db, conversation_id)
    if not user or not conv:
        return "הכלי לא זמין"

    cooldown.mark_fired(db, conversation_id, row.id)
    staff = []
    webhook_result = None
    if row.phones:
        staff = await send_staff(db, agent, list(row.phones), payload.staff_text(row, user, values))
    if row.webhook_url:
        webhook_result = await post_webhook(
            row.webhook_url,
            payload.envelope(row, agent.id, conversation_id, user, values),
        )
    note.write_note(
        db, conv, row.name, list(row.fields or []), values,
        list(row.phones or []), row.webhook_url, staff, webhook_result,
    )
    return TOOL_OK
