"""Identity → existing process_batched_messages. No LLM here."""
from __future__ import annotations

import asyncio
from datetime import datetime

from sqlalchemy.orm.attributes import flag_modified

from backend.models.conversation import Conversation
from backend.models.user import User
from backend.services.entities import conversations, users
from backend.services.messaging.buffer import PendingMessage, add_message
from backend.services.messaging.processing import process_batched_messages
from backend.services.playground import identity, present, repo
from backend.services.playground.constants import CLOSED_MESSAGE, MAX_TESTERS
from backend.services.playground.outbound import PlaygroundOutbound
from backend.services.playground import media as pg_media

_background: set[asyncio.Task] = set()


def ensure_tester(db, link, name: str, raw_phone: str) -> User:
    normalized = identity.normalize_phone(raw_phone)
    storage = identity.storage_phone(link.id, normalized)
    existing = users.get_by_phone(db, storage)
    if existing is None:
        testers = repo.tester_counts(db, [link.id]).get(link.id, 0)
        if testers >= MAX_TESTERS:
            raise ValueError("הקישור מלא")
    display = (name or "").strip()[:100] or None
    user = users.get_or_create(db, storage, display)
    user.playground_link_id = link.id
    if display:
        user.name = display
    meta = dict(user.metadata_ or {})
    meta["claimed_phone"] = normalized
    if display:
        meta["claimed_name"] = display
    user.metadata_ = meta
    flag_modified(user, "metadata_")
    db.commit()
    db.refresh(user)
    return user


def live_or_create(db, agent, link, user: User) -> Conversation:
    conv = repo.live_conversation(db, link.id, user.id)
    if conv:
        return conv
    return conversations.get_or_create(db, agent.id, user.id, playground_link_id=link.id)


def archive_and_reset(db, agent, link, user: User) -> Conversation:
    live = repo.live_conversation(db, link.id, user.id)
    if live:
        live.archived_at = datetime.utcnow()
        db.commit()
    return conversations.get_or_create(db, agent.id, user.id, playground_link_id=link.id)


def session_payload(db, agent, link, user: User | None, gate) -> dict:
    conv = repo.live_conversation(db, link.id, user.id) if user else None
    messages = present.public_transcript(db, conv.id) if conv else []
    return {
        "agent_name": (agent.name if agent else None) or link.agent_name_snapshot,
        "closed": not gate.open,
        "closed_message": None if gate.open else CLOSED_MESSAGE,
        "messages": messages,
        "conversation_id": conv.id if conv else None,
        "tester_name": user.name if user else None,
    }


async def ingest_text(agent, link, user: User, conv: Conversation, text: str, reply_to: str | None) -> None:
    await ingest_pending(agent, user, conv, PendingMessage(text=text, reply_to_text=reply_to))


async def ingest_pending(agent, user: User, conv: Conversation, pending: PendingMessage) -> None:
    agent_id = agent.id
    phone = user.phone
    name = user.name
    conv_id = conv.id
    outbound = PlaygroundOutbound(conv_id)
    batching = agent.get_batching_config()
    debounce = int(batching.get("debounce_seconds", 3) or 0)
    max_batch = int(batching.get("max_batch_messages", 10) or 10)

    async def process_callback(pending_msgs: list[PendingMessage]):
        await pg_media.hydrate_for_vision(pending_msgs)
        await process_batched_messages(
            agent_id,
            phone,
            name,
            pending_msgs,
            outbound.send_message,
            "playground",
            outbound.send_media,
            outbound=outbound,
        )

    skip_redis = debounce == 0 or (pending.image_base64 and not pending.media_url)
    if skip_redis:
        task = asyncio.create_task(process_callback([pending]))
        _background.add(task)
        task.add_done_callback(_background.discard)
        return
    await add_message(
        agent_id=agent_id,
        user_phone=phone,
        text=pending.text,
        debounce_seconds=debounce,
        max_messages=max_batch,
        process_callback=process_callback,
        msg_type=pending.msg_type,
        media_type=pending.media_type,
        media_url=pending.media_url,
        media_too_large=pending.media_too_large,
        reply_to_text=pending.reply_to_text,
    )
