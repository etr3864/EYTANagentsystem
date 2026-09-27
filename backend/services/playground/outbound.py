import asyncio
from datetime import datetime, timezone

from backend.services.messaging.channel import OutboundCaps
from backend.services.playground import streams

BUBBLE_GAP_SECONDS = 1.0


class PlaygroundOutbound:
    def __init__(self, conversation_id: int, *, pause_between_bubbles: bool = False):
        self.conversation_id = conversation_id
        self._pause_between_bubbles = pause_between_bubbles

    def capabilities(self) -> OutboundCaps:
        return OutboundCaps(
            followups=False,
            reminders=False,
            escalation_tools=False,
            google_writes=False,
            usage_source="playground",
            calendar_as_connected=True,
        )

    async def send_message(self, to: str, text: str, meta: dict | None = None) -> bool:
        message = dict(meta or {})
        message.setdefault("role", "assistant")
        message.setdefault("content", text)
        message.setdefault("message_type", "text")
        await streams.publish(self.conversation_id, {"type": "message", "message": message})
        return True

    async def send_media(
        self, to: str, url: str, media_type: str, caption: str | None, filename: str | None = None,
    ) -> bool:
        await streams.publish(self.conversation_id, {
            "type": "message",
            "message": {
                "role": "assistant",
                "content": caption or "",
                "message_type": media_type,
                "media_url": url,
                "filename": filename,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        })
        return True

    async def send_typing(self, to: str) -> None:
        await streams.publish(self.conversation_id, {"type": "typing"})

    async def emit_status(self, to: str, status: str | None) -> None:
        if status == "מקליד":
            await self.send_typing(to)
            if self._pause_between_bubbles:
                await asyncio.sleep(BUBBLE_GAP_SECONDS)
            return
        await streams.publish(self.conversation_id, {"type": "status", "status": status})
