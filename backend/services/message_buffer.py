"""Message batching buffer - groups rapid messages before AI processing.

Supports two backends:
- Redis (distributed, for production scaling)
- In-memory (fallback when Redis unavailable)
"""
import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Awaitable, Optional
import redis.asyncio as redis

from backend.core.config import settings


@dataclass
class PendingMessage:
    text: str
    msg_type: str = "text"
    image_base64: Optional[str] = None
    media_type: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> dict:
        return {
            "text": self.text,
            "msg_type": self.msg_type,
            "image_base64": self.image_base64,
            "media_type": self.media_type,
            "timestamp": self.timestamp.isoformat()
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "PendingMessage":
        return cls(
            text=data["text"],
            msg_type=data.get("msg_type", "text"),
            image_base64=data.get("image_base64"),
            media_type=data.get("media_type"),
            timestamp=datetime.fromisoformat(data["timestamp"]) if data.get("timestamp") else datetime.utcnow()
        )


# Redis connection pool (lazy init)
_redis_pool: Optional[redis.Redis] = None
_redis_available: Optional[bool] = None

# Fallback in-memory buffer
@dataclass
class UserBuffer:
    messages: list[PendingMessage] = field(default_factory=list)
    task: asyncio.Task | None = None

_memory_buffers: dict[tuple[int, str], UserBuffer] = {}

# Active processing tasks (for both Redis and memory mode)
_processing_tasks: dict[str, asyncio.Task] = {}


async def _get_redis() -> Optional[redis.Redis]:
    """Get Redis connection, return None if unavailable."""
    global _redis_pool, _redis_available
    
    if _redis_available is False:
        return None
    
    if _redis_pool is None:
        try:
            _redis_pool = redis.from_url(
                settings.redis_url,
                encoding="utf-8",
                decode_responses=True
            )
            await _redis_pool.ping()
            _redis_available = True
        except Exception:
            _redis_available = False
            return None
    
    return _redis_pool


def _buffer_key(agent_id: int, user_phone: str) -> str:
    """Redis key for message buffer."""
    return f"msg_buffer:{agent_id}:{user_phone}"


def _lock_key(agent_id: int, user_phone: str) -> str:
    """Redis key for processing lock."""
    return f"msg_lock:{agent_id}:{user_phone}"


async def add_message(
    agent_id: int,
    user_phone: str,
    text: str,
    debounce_seconds: int,
    max_messages: int,
    process_callback: Callable[[list[PendingMessage]], Awaitable[None]],
    msg_type: str = "text",
    image_base64: Optional[str] = None,
    media_type: Optional[str] = None
) -> None:
    """Add message to buffer. Processes when debounce expires or max reached."""
    r = await _get_redis()
    
    if r:
        await _add_message_redis(
            r, agent_id, user_phone, text, debounce_seconds, max_messages,
            process_callback, msg_type, image_base64, media_type
        )
    else:
        await _add_message_memory(
            agent_id, user_phone, text, debounce_seconds, max_messages,
            process_callback, msg_type, image_base64, media_type
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
    media_type: Optional[str] = None
) -> None:
    """Redis-backed message buffer."""
    key = _buffer_key(agent_id, user_phone)
    task_key = f"{agent_id}:{user_phone}"
    
    # Add message to Redis list
    msg = PendingMessage(
        text=text,
        msg_type=msg_type,
        image_base64=image_base64,
        media_type=media_type
    )
    await r.rpush(key, json.dumps(msg.to_dict()))
    await r.expire(key, debounce_seconds + 60)  # Auto-cleanup
    
    # Check message count
    count = await r.llen(key)
    
    # Cancel existing timer
    if task_key in _processing_tasks:
        task = _processing_tasks[task_key]
        if not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
    
    # Process immediately if max reached
    if count >= max_messages:
        await _process_redis_buffer(r, agent_id, user_phone, process_callback)
        return
    
    # Start new debounce timer
    _processing_tasks[task_key] = asyncio.create_task(
        _delayed_redis_process(r, agent_id, user_phone, debounce_seconds, process_callback)
    )


async def _delayed_redis_process(
    r: redis.Redis,
    agent_id: int,
    user_phone: str,
    delay: int,
    callback: Callable[[list[PendingMessage]], Awaitable[None]]
) -> None:
    """Wait for delay then process the Redis buffer."""
    await asyncio.sleep(delay)
    await _process_redis_buffer(r, agent_id, user_phone, callback)


async def _process_redis_buffer(
    r: redis.Redis,
    agent_id: int,
    user_phone: str,
    callback: Callable[[list[PendingMessage]], Awaitable[None]]
) -> None:
    """Process all messages in Redis buffer with distributed lock."""
    key = _buffer_key(agent_id, user_phone)
    lock_key = _lock_key(agent_id, user_phone)
    task_key = f"{agent_id}:{user_phone}"
    
    # Try to acquire lock (prevent duplicate processing across instances)
    lock_acquired = await r.set(lock_key, "1", nx=True, ex=30)
    if not lock_acquired:
        return  # Another instance is processing
    
    try:
        # Get all messages atomically
        messages_json = await r.lrange(key, 0, -1)
        if not messages_json:
            return
        
        # Clear the buffer
        await r.delete(key)
        
        # Parse messages
        messages = [PendingMessage.from_dict(json.loads(m)) for m in messages_json]
        
        # Cleanup task reference
        if task_key in _processing_tasks:
            del _processing_tasks[task_key]
        
        # Process
        await callback(messages)
    finally:
        await r.delete(lock_key)


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
    media_type: Optional[str] = None
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
        media_type=media_type
    ))
    
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
