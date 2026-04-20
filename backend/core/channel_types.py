"""Channel type definitions and capabilities matrix.

Single source of truth for channel types and their capabilities.
The FE uses an identical JSON file at frontend/lib/channel-capabilities.json.
"""
import json
import os
from enum import Enum
from typing import TypedDict


class ChannelType(str, Enum):
    WHATSAPP_WASENDER = "whatsapp_wasender"
    WHATSAPP_META = "whatsapp_meta"
    INSTAGRAM = "instagram"
    MESSENGER = "messenger"


# WhatsApp mutex group — only one can be active per agent
WHATSAPP_CHANNEL_TYPES = {ChannelType.WHATSAPP_WASENDER, ChannelType.WHATSAPP_META}


class ChannelCapabilities(TypedDict):
    text: bool
    images: bool
    files: bool
    voice: bool
    reminders: bool
    followups: bool
    templates: bool
    has_24h_window: bool
    story_replies: bool
    mentions: bool


def _load_capabilities() -> dict[str, ChannelCapabilities]:
    _dir = os.path.dirname(__file__)
    path = os.path.join(_dir, "channel_capabilities.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# Loaded once at startup — do not mutate
CHANNEL_CAPABILITIES: dict[str, ChannelCapabilities] = _load_capabilities()


def get_capabilities(channel_type: str) -> ChannelCapabilities:
    """Return capabilities for a channel type, defaulting to minimal."""
    return CHANNEL_CAPABILITIES.get(
        channel_type,
        {k: False for k in ChannelCapabilities.__annotations__},
    )


CHANNEL_DISPLAY_NAMES: dict[str, str] = {
    ChannelType.WHATSAPP_WASENDER: "WhatsApp (WaSender)",
    ChannelType.WHATSAPP_META: "WhatsApp (Meta)",
    ChannelType.INSTAGRAM: "Instagram",
    ChannelType.MESSENGER: "Messenger",
}
