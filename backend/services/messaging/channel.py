"""Outbound transport contract — not WhatsApp send helpers (see outbound.py)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Awaitable, Callable, Protocol, runtime_checkable

MediaSendCallback = Callable[[str, str, str, str | None, str | None], Awaitable[bool]]
TextSendCallback = Callable[[str, str], Awaitable[bool]]
TypingCallback = Callable[[str], Awaitable[None]]


@dataclass(frozen=True)
class OutboundCaps:
    followups: bool = True
    reminders: bool = True
    escalation_tools: bool = True
    google_writes: bool = True
    usage_source: str = "conversation"
    calendar_as_connected: bool = False


@runtime_checkable
class OutboundChannel(Protocol):
    async def send_message(self, to: str, text: str, meta: dict | None = None) -> bool: ...
    async def send_media(
        self, to: str, url: str, media_type: str, caption: str | None, filename: str | None = None,
    ) -> bool: ...
    async def send_typing(self, to: str) -> None: ...
    async def emit_status(self, to: str, status: str | None) -> None: ...
    def capabilities(self) -> OutboundCaps: ...


class CallbackOutbound:
    """Wraps existing webhook send_message / send_media callbacks."""

    def __init__(
        self,
        send_message: TextSendCallback,
        send_media: MediaSendCallback | None = None,
        send_typing: TypingCallback | None = None,
    ):
        self._send = send_message
        self._media = send_media
        self._typing = send_typing
        self.last_provider_msg_id: str | None = None

    async def send_message(self, to: str, text: str, meta: dict | None = None) -> bool:
        result = await self._send(to, text)
        if isinstance(result, str) and result and result != "ok":
            self.last_provider_msg_id = result
            return True
        self.last_provider_msg_id = None
        return bool(result)

    async def send_media(
        self, to: str, url: str, media_type: str, caption: str | None, filename: str | None = None,
    ) -> bool:
        if not self._media:
            return False
        return await self._media(to, url, media_type, caption, filename)

    async def send_typing(self, to: str) -> None:
        if self._typing:
            await self._typing(to)

    async def emit_status(self, to: str, status: str | None) -> None:
        if status == "מקליד":
            await self.send_typing(to)

    def capabilities(self) -> OutboundCaps:
        return OutboundCaps()
