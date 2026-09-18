"""Entry point from webhook handlers into the inbound message pipeline."""
from typing import Awaitable, Callable, Optional

from backend.services.messaging.buffer import PendingMessage
from backend.services.messaging.channel import (
    CallbackOutbound,
    MediaSendCallback,
    OutboundChannel,
)
from backend.services.messaging.pipeline import TurnRequest, run_turn


async def process_batched_messages(
    agent_id: int,
    user_phone: str,
    user_name: str | None,
    pending_msgs: list[PendingMessage],
    send_message: Callable[[str, str], Awaitable[bool]],
    provider: str = "meta",
    send_media: MediaSendCallback | None = None,
    channel_id: Optional[int] = None,
    channel_user_id: Optional[int] = None,
    outbound: OutboundChannel | None = None,
    send_typing: Callable[[str], Awaitable[None]] | None = None,
) -> None:
    """Process one batch of buffered inbound messages.

    Args:
        agent_id: The agent ID
        user_phone: User's phone number (external_id)
        user_name: User's name (optional)
        pending_msgs: Messages released by the buffer
        send_message: Fallback text sender, used when no outbound channel is given
        provider: Provider name for logging
        send_media: Fallback media sender, used when no outbound channel is given
        channel_id: AgentChannel.id — backfilled onto the conversation when set
        channel_user_id: ChannelUser.id — stored on new messages when set
        outbound: Preferred transport; replaces the two callbacks above
    """
    await run_turn(
        TurnRequest(
            agent_id=agent_id,
            user_phone=user_phone,
            user_name=user_name,
            pending=pending_msgs,
            outbound=outbound or CallbackOutbound(send_message, send_media, send_typing),
            provider=provider,
            channel_id=channel_id,
            channel_user_id=channel_user_id,
        )
    )
