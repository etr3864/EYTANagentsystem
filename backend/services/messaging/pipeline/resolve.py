"""Opening stage: identify the turn and reset engagement state."""
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from backend.core.database import SessionLocal
from backend.core.enums import FollowupStatus
from backend.core.logger import log_error
from backend.models.scheduled_followup import ScheduledFollowup
from backend.models.user import User
from backend.services.entities import agents, conversations, users
from backend.services.messaging.buffer import is_stale
from backend.services.messaging.pipeline.context import TurnContext, TurnRequest, detach
from backend.services.messaging.triggers import persistent_for_agent

STALE_REPLY = "לא הצלחנו לטפל בהודעה בזמן. אפשר לשלוח שוב?"

DEFAULT_MAX_HISTORY = 20


def user_context(user: User) -> dict:
    """Extract user info for AI context."""
    meta = user.metadata_ or {}
    return {
        "name": user.name,
        "phone": meta.get("claimed_phone") or user.phone,
        "gender": user.gender.value if user.gender else "unknown",
        "metadata": meta,
    }


async def open_turn(request: TurnRequest) -> Optional[TurnContext]:
    """Resolve agent, user and conversation. Returns None when the turn cannot run."""
    pending = [msg for msg in request.pending if not is_stale(msg)]
    if not pending:
        await request.outbound.send_message(request.user_phone, STALE_REPLY)
        return None

    with SessionLocal() as db:
        agent = agents.get_by_id(db, request.agent_id)
        if not agent:
            log_error("process", f"agent_id={request.agent_id} not found")
            return None

        user = users.get_or_create(db, request.user_phone, request.user_name)
        conversation = conversations.get_or_create(
            db, agent.id, user.id, playground_link_id=user.playground_link_id,
        )
        is_playground = bool(user.playground_link_id)
        if is_playground:
            conversation.channel_type_snapshot = (
                conversation.channel_type_snapshot or "playground"
            )

        user_info = _user_info(db, user, request)
        _inject_trigger_data(user_info, user, agent.id, conversation)
        _bind_channel(db, conversation, request)
        _reset_engagement(db, conversation, is_playground)
        detach(db, agent, user, conversation)

    await _cancel_followup_timer(agent.id, conversation.id, is_playground)

    return TurnContext(
        request=request,
        agent=agent,
        user=user,
        conversation=conversation,
        user_info=user_info,
        prompt=_system_prompt(agent),
        display_name=user.name or request.user_phone[-4:],
        caps=request.outbound.capabilities(),
        pending=pending,
        max_history=agent.get_batching_config().get(
            "max_history_messages", DEFAULT_MAX_HISTORY
        ),
    )


def _user_info(db: Session, user: User, request: TurnRequest) -> dict:
    info = user_context(user)
    info["channel"] = request.provider
    if not request.channel_user_id:
        return info

    from backend.services.channels.channel_users import get_by_id as get_channel_user

    channel_user = get_channel_user(db, request.channel_user_id)
    if channel_user:
        if channel_user.display_name:
            info["channel_username"] = channel_user.display_name
        if channel_user.metadata_:
            info["channel_meta"] = channel_user.metadata_
    return info


def _inject_trigger_data(info: dict, user: User, agent_id: int, conversation) -> None:
    external_data = persistent_for_agent(user, agent_id)
    if external_data:
        info["external_data"] = external_data
    if conversation.injected_context:
        info["session_data"] = conversation.injected_context


def _system_prompt(agent) -> str:
    base = agent.system_prompt or ""
    if not getattr(agent, "business_assistant_mode", False):
        return base
    compliance = (
        f"You are a customer service assistant for {agent.name}. "
        f"You ONLY assist with topics related to this business.\n\n"
    )
    return compliance + base


def _bind_channel(db: Session, conversation, request: TurnRequest) -> None:
    """Backfill channel columns the first time a conversation sees a channel."""
    if not request.channel_id or conversation.channel_id is not None:
        return
    conversation.channel_id = request.channel_id
    conversation.channel_user_id = request.channel_user_id
    try:
        from backend.models.agent_channel import AgentChannel

        channel = (
            db.query(AgentChannel).filter(AgentChannel.id == request.channel_id).first()
        )
        if channel:
            conversation.channel_type_snapshot = channel.channel_type
    except Exception:
        pass


def _reset_engagement(db: Session, conversation, is_playground: bool) -> None:
    if conversation.opted_out and not is_playground:
        conversation.opted_out = False
    conversation.last_customer_message_at = datetime.utcnow()
    if not is_playground:
        from backend.services.engagement import followups

        _mark_followup_responded(db, conversation.id)
        followups.cancel_pending_followups(db, conversation.id)
    db.commit()


async def _cancel_followup_timer(
    agent_id: int, conversation_id: int, is_playground: bool
) -> None:
    if is_playground:
        return
    from backend.services.engagement import followups

    await followups.cancel_followup_timer(agent_id, conversation_id)


def _mark_followup_responded(db: Session, conversation_id: int) -> None:
    """Mark any unresponded sent follow-ups for this conversation as responded."""
    db.query(ScheduledFollowup).filter(
        ScheduledFollowup.conversation_id == conversation_id,
        ScheduledFollowup.status == FollowupStatus.SENT,
        ScheduledFollowup.responded_at.is_(None),
    ).update({"responded_at": datetime.utcnow()}, synchronize_session="fetch")
