"""Message batching buffer - groups rapid messages before AI processing.

Supports two backends:
- Redis (distributed, for production scaling)
- In-memory (fallback when Redis unavailable)
"""
import asyncio
import json
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Awaitable, Optional
import redis.asyncio as redis

from backend.core.config import settings
from backend.core.logger import log_error

BUFFER_TTL_SECONDS = 600
# Short TTL + heartbeat: a crashed holder releases within ~LOCK_TTL, not minutes.
LOCK_TTL_SECONDS = 45
MAX_DRAIN_DEPTH = 3
STALE_AFTER_SECONDS = 600
HEARTBEAT_SECONDS = 15
LOCK_RETRY_SECONDS = 2
REDIS_RETRY_COOLDOWN_SECONDS = 30


@dataclass
class PendingMessage:
    text: str
    msg_type: str = "text"
    image_base64: Optional[str] = None
    media_type: Optional[str] = None
    media_url: Optional[str] = None
    media_too_large: bool = False
    reply_to_text: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "msg_type": self.msg_type,
            "image_base64": self.image_base64,
            "media_type": self.media_type,
            "media_url": self.media_url,
            "media_too_large": self.media_too_large,
            "reply_to_text": self.reply_to_text,
            "timestamp": self.timestamp.isoformat()
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "PendingMessage":
        return cls(
            text=data["text"],
            msg_type=data.get("msg_type", "text"),
            image_base64=data.get("image_base64"),
            media_type=data.get("media_type"),
            media_url=data.get("media_url"),
            media_too_large=bool(data.get("media_too_large")),
            reply_to_text=data.get("reply_to_text"),
            timestamp=datetime.fromisoformat(data["timestamp"]) if data.get("timestamp") else datetime.utcnow()
        )


# Redis connection pool (lazy init)
_redis_pool: Optional[redis.Redis] = None
_redis_retry_after: float = 0.0

ProcessCallback = Callable[[list[PendingMessage]], Awaitable[None]]


# Fallback in-memory buffer
@dataclass
class UserBuffer:
    messages: list[PendingMessage] = field(default_factory=list)
    task: asyncio.Task | None = None
    callback: Optional[ProcessCallback] = None

_memory_buffers: dict[tuple[int, str], UserBuffer] = {}


@dataclass
class _DebounceTimer:
    """A pending drain owned by this process, retained so shutdown can flush it."""

    task: asyncio.Task
    agent_id: int
    user_phone: str
    callback: ProcessCallback


_processing_tasks: dict[str, _DebounceTimer] = {}


async def _get_redis() -> Optional[redis.Redis]:
    """Get Redis connection, or None while it is unreachable.

    A failure is remembered only for a cooldown. Giving up permanently would
    leave the process on the in-memory buffer for its whole life, which
    silently stops batching from working across processes.
    """
    global _redis_pool, _redis_retry_after

    if _redis_pool is not None:
        return _redis_pool
    if time.monotonic() < _redis_retry_after:
        return None

    try:
        pool = redis.from_url(
            settings.redis_url, encoding="utf-8", decode_responses=True,
        )
        await pool.ping()
    except Exception:
        _redis_retry_after = time.monotonic() + REDIS_RETRY_COOLDOWN_SECONDS
        return None

    _redis_pool = pool
    return _redis_pool


def _buffer_key(agent_id: int, user_phone: str) -> str:
    """Redis key for message buffer."""
    return f"msg_buffer:{agent_id}:{user_phone}"


def _lock_key(agent_id: int, user_phone: str) -> str:
    """Redis key for processing lock."""
    return f"msg_lock:{agent_id}:{user_phone}"


def _generation_key(agent_id: int, user_phone: str) -> str:
    """Redis key for the debounce generation counter."""
    return f"msg_gen:{agent_id}:{user_phone}"


async def _bump_generation(r: redis.Redis, agent_id: int, user_phone: str) -> int:
    """Invalidate every timer started before this message."""
    key = _generation_key(agent_id, user_phone)
    generation = await r.incr(key)
    await r.expire(key, BUFFER_TTL_SECONDS)
    return generation


async def _current_generation(r: redis.Redis, agent_id: int, user_phone: str) -> int:
    raw = await r.get(_generation_key(agent_id, user_phone))
    return int(raw) if raw else 0


async def add_message(
    agent_id: int,
    user_phone: str,
    text: str,
    debounce_seconds: int,
    max_messages: int,
    process_callback: Callable[[list[PendingMessage]], Awaitable[None]],
    msg_type: str = "text",
    image_base64: Optional[str] = None,
    media_type: Optional[str] = None,
    media_url: Optional[str] = None,
    media_too_large: bool = False,
    reply_to_text: Optional[str] = None,
) -> None:
    """Add message to buffer. Processes when debounce expires or max reached."""
    r = await _get_redis()
    
    if r:
        await _add_message_redis(
            r, agent_id, user_phone, text, debounce_seconds, max_messages,
            process_callback, msg_type, image_base64, media_type,
            media_url, media_too_large, reply_to_text,
        )
    else:
        await _add_message_memory(
            agent_id, user_phone, text, debounce_seconds, max_messages,
            process_callback, msg_type, image_base64, media_type,
            media_url, media_too_large, reply_to_text,
        )


async def _add_message_redis(
    r: redis.Redis,
    agent_id: int,
    user_phone: str,
    text: str,
    debounce_seconds: int,
    max_messages: int,
    process_callback: Callable[[list[PendingMessage]], Awaitable[None]],
    msg_type: str = "text",
    image_base64: Optional[str] = None,
    media_type: Optional[str] = None,
    media_url: Optional[str] = None,
    media_too_large: bool = False,
    reply_to_text: Optional[str] = None,
) -> None:
    """Redis-backed message buffer."""
    key = _buffer_key(agent_id, user_phone)
    task_key = f"{agent_id}:{user_phone}"
    
    # Add message to Redis list
    msg = PendingMessage(
        text=text,
        msg_type=msg_type,
        image_base64=image_base64,
        media_type=media_type,
        media_url=media_url,
        media_too_large=media_too_large,
        reply_to_text=reply_to_text,
    )
    await r.rpush(key, json.dumps(msg.to_dict()))
    await r.expire(key, BUFFER_TTL_SECONDS)

    generation = await _bump_generation(r, agent_id, user_phone)
    count = await r.llen(key)

    # Local cancellation is an optimisation only — a timer in another process
    # cannot be cancelled from here, so correctness rests on the generation.
    existing = _processing_tasks.get(task_key)
    if existing and not existing.task.done():
        existing.task.cancel()
        try:
            await existing.task
        except asyncio.CancelledError:
            pass
    
    # Process immediately if max reached
    if count >= max_messages:
        await _process_redis_buffer(r, agent_id, user_phone, process_callback)
        return
    
    _arm_timer(r, agent_id, user_phone, debounce_seconds, process_callback, generation)


async def _delayed_redis_process(
    r: redis.Redis,
    agent_id: int,
    user_phone: str,
    delay: int,
    callback: Callable[[list[PendingMessage]], Awaitable[None]],
    generation: int,
) -> None:
    """Drain after the delay, unless a newer message restarted the debounce.

    Any process may hold the timer for this conversation. The one whose
    generation still matches Redis is the only one allowed to drain.
    """
    await asyncio.sleep(delay)
    if await _current_generation(r, agent_id, user_phone) != generation:
        return
    await _process_redis_buffer(r, agent_id, user_phone, callback)


def is_stale(msg: PendingMessage) -> bool:
    age = (datetime.utcnow() - msg.timestamp).total_seconds()
    return age > STALE_AFTER_SECONDS


async def drain_now() -> None:
    """Flush every buffer this process still owns, before it goes away.

    Covers a graceful stop only. A hard kill leaves the batch in Redis until
    its TTL expires, unanswered — recovering that needs a worker able to
    rebuild the outbound channel from scratch.
    """
    timers = list(_processing_tasks.values())
    _processing_tasks.clear()
    for timer in timers:
        timer.task.cancel()

    r = await _get_redis() if timers else None
    for timer in timers:
        if r is None:
            break
        try:
            await _process_redis_buffer(r, timer.agent_id, timer.user_phone, timer.callback)
        except Exception as error:
            log_error("buffer", f"drain failed on shutdown: {str(error)[:80]}")

    for key, buffer in list(_memory_buffers.items()):
        if buffer.task:
            buffer.task.cancel()
        if not buffer.messages or buffer.callback is None:
            continue
        try:
            await _process_memory_buffer(key, buffer.callback)
        except Exception as error:
            log_error("buffer", f"memory drain failed on shutdown: {str(error)[:80]}")


async def _refresh_lock(r: redis.Redis, lock_key: str, stop: asyncio.Event) -> None:
    while not stop.is_set():
        await asyncio.sleep(HEARTBEAT_SECONDS)
        if stop.is_set():
            break
        try:
            await r.expire(lock_key, LOCK_TTL_SECONDS)
        except Exception:
            break


def _arm_timer(
    r: redis.Redis,
    agent_id: int,
    user_phone: str,
    delay: int,
    callback: ProcessCallback,
    generation: int,
) -> None:
    """Replace any local timer for this conversation with a fresh one."""
    task_key = f"{agent_id}:{user_phone}"
    existing = _processing_tasks.get(task_key)
    if existing and not existing.task.done():
        existing.task.cancel()
    _processing_tasks[task_key] = _DebounceTimer(
        task=asyncio.create_task(
            _delayed_redis_process(
                r, agent_id, user_phone, delay, callback, generation,
            )
        ),
        agent_id=agent_id,
        user_phone=user_phone,
        callback=callback,
    )


async def _process_redis_buffer(
    r: redis.Redis,
    agent_id: int,
    user_phone: str,
    callback: Callable[[list[PendingMessage]], Awaitable[None]],
    drain_depth: int = 0,
) -> None:
    key = _buffer_key(agent_id, user_phone)
    lock_key = _lock_key(agent_id, user_phone)
    task_key = f"{agent_id}:{user_phone}"

    lock_acquired = await r.set(lock_key, "1", nx=True, ex=LOCK_TTL_SECONDS)
    if not lock_acquired:
        # A live worker is draining, or a dead holder still owns the key until
        # TTL. Returning with no timer used to orphan the batch for up to
        # BUFFER_TTL after deploys — reschedule so we retry once the lock frees.
        if drain_depth == 0:
            from backend.core.logger import log
            log("buffer_lock_busy", agent_id=agent_id, retry_in=LOCK_RETRY_SECONDS)
            _arm_timer(
                r, agent_id, user_phone, LOCK_RETRY_SECONDS, callback,
                await _current_generation(r, agent_id, user_phone),
            )
        return

    stop = asyncio.Event()
    heartbeat = asyncio.create_task(_refresh_lock(r, lock_key, stop))
    try:
        messages_json = await r.lrange(key, 0, -1)
        if not messages_json:
            return

        await r.delete(key)
        messages = [PendingMessage.from_dict(json.loads(m)) for m in messages_json]
        if task_key in _processing_tasks:
            del _processing_tasks[task_key]
        await callback(messages)
    finally:
        stop.set()
        heartbeat.cancel()
        await r.delete(lock_key)

    leftover = await r.llen(key)
    if leftover and drain_depth < MAX_DRAIN_DEPTH:
        await _process_redis_buffer(r, agent_id, user_phone, callback, drain_depth + 1)
    elif leftover:
        _arm_timer(
            r, agent_id, user_phone, 1, callback,
            await _current_generation(r, agent_id, user_phone),
        )


# === In-Memory Fallback (original implementation) ===

async def _add_message_memory(
    agent_id: int,
    user_phone: str,
    text: str,
    debounce_seconds: int,
    max_messages: int,
    process_callback: Callable[[list[PendingMessage]], Awaitable[None]],
    msg_type: str = "text",
    image_base64: Optional[str] = None,
    media_type: Optional[str] = None,
    media_url: Optional[str] = None,
    media_too_large: bool = False,
    reply_to_text: Optional[str] = None,
) -> None:
    """In-memory buffer (fallback when Redis unavailable)."""
    key = (agent_id, user_phone)
    
    if key not in _memory_buffers:
        _memory_buffers[key] = UserBuffer()
    
    buffer = _memory_buffers[key]
    
    if buffer.task and not buffer.task.done():
        buffer.task.cancel()
        try:
            await buffer.task
        except asyncio.CancelledError:
            pass
    
    buffer.messages.append(PendingMessage(
        text=text,
        msg_type=msg_type,
        image_base64=image_base64,
        media_type=media_type,
        media_url=media_url,
        media_too_large=media_too_large,
        reply_to_text=reply_to_text,
    ))
    buffer.callback = process_callback
    
    if len(buffer.messages) >= max_messages:
        await _process_memory_buffer(key, process_callback)
        return
    
    buffer.task = asyncio.create_task(
        _delayed_memory_process(key, debounce_seconds, process_callback)
    )


async def _delayed_memory_process(
    key: tuple[int, str],
    delay: int,
    callback: Callable[[list[PendingMessage]], Awaitable[None]]
) -> None:
    """Wait for delay then process the memory buffer."""
    await asyncio.sleep(delay)
    await _process_memory_buffer(key, callback)


async def _process_memory_buffer(
    key: tuple[int, str],
    callback: Callable[[list[PendingMessage]], Awaitable[None]]
) -> None:
    if key not in _memory_buffers:
        return
    
    buffer = _memory_buffers[key]
    if not buffer.messages:
        return
    
    pending_messages = buffer.messages.copy()
    buffer.messages = []
    buffer.task = None
    
    if key in _memory_buffers and not _memory_buffers[key].messages:
        del _memory_buffers[key]
    
    await callback(pending_messages)
