"""State passed between pipeline stages.

Stages own their own database sessions. The agent, user and conversation rows
travel between stages detached — every attribute is loaded before the opening
stage closes its session, so reads need no connection and no stage can hold one
across the model call. Writes always go through a fresh session.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from sqlalchemy.orm import Session

from backend.services.messaging.buffer import PendingMessage
from backend.services.messaging.channel import OutboundCaps, OutboundChannel


def detach(db: Session, *rows) -> None:
    """Load every column, then cut the row loose from its session."""
    for row in rows:
        db.refresh(row)
        db.expunge(row)


@dataclass(frozen=True)
class TurnRequest:
    """Everything a webhook hands over for one inbound turn."""

    agent_id: int
    user_phone: str
    user_name: Optional[str]
    pending: list[PendingMessage]
    outbound: OutboundChannel
    provider: str = "meta"
    channel_id: Optional[int] = None
    channel_user_id: Optional[int] = None


@dataclass
class TurnContext:
    """Identity and accumulated state for one inbound turn."""

    request: TurnRequest
    agent: Any
    user: Any
    conversation: Any
    user_info: dict
    prompt: str
    display_name: str
    caps: OutboundCaps
    pending: list[PendingMessage]
    max_history: int
    combined_text: str = ""
    has_images: bool = False
    vision_usage: dict = field(
        default_factory=lambda: {"input_tokens": 0, "output_tokens": 0}
    )
    # Media already pushed to the channel mid-turn (before the model finishes).
    media_sent_ids: set = field(default_factory=set)

    @property
    def outbound(self) -> OutboundChannel:
        return self.request.outbound

    @property
    def phone(self) -> str:
        return self.request.user_phone

    @property
    def provider(self) -> str:
        return self.request.provider

    @property
    def agent_id(self) -> int:
        return self.agent.id

    @property
    def user_id(self) -> int:
        return self.user.id

    @property
    def conversation_id(self) -> int:
        return self.conversation.id

    @property
    def playground_link_id(self) -> Optional[int]:
        return self.user.playground_link_id

    @property
    def is_playground(self) -> bool:
        return bool(self.user.playground_link_id)


@dataclass
class PromptInputs:
    """Read-only material the model call needs."""

    history: list[dict]
    knowledge_context: Any
    media_context: Any
    user_appointments: list
    calendar_config: Optional[dict]
    extra_tools: list
    function_runtime: Any


@dataclass
class ModelReply:
    text: str
    usage: dict
    media_actions: list
