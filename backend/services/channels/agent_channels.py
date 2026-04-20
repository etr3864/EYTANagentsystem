"""Agent channel management service.

Handles CRUD for AgentChannel records with:
- pg_advisory_xact_lock for mutex enforcement (WaSender ↔ WA Meta)
- Fernet encryption/decryption of credentials
"""
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.core.channel_types import ChannelType, WHATSAPP_CHANNEL_TYPES
from backend.core.encryption import encrypt_credentials, decrypt_credentials
from backend.models.agent_channel import AgentChannel


class ChannelConflictError(Exception):
    """Raised when trying to add a channel that conflicts with an existing one."""


class ChannelNotFoundError(Exception):
    """Raised when channel is not found."""


def get_active_channels(db: Session, agent_id: int) -> list[AgentChannel]:
    """Return all active channels for an agent."""
    return (
        db.query(AgentChannel)
        .filter(AgentChannel.agent_id == agent_id, AgentChannel.is_active.is_(True))
        .all()
    )


def get_channel(db: Session, channel_id: int) -> Optional[AgentChannel]:
    return db.query(AgentChannel).filter(AgentChannel.id == channel_id).first()


def get_channel_by_type(db: Session, agent_id: int, channel_type: str) -> Optional[AgentChannel]:
    return (
        db.query(AgentChannel)
        .filter(
            AgentChannel.agent_id == agent_id,
            AgentChannel.channel_type == channel_type,
            AgentChannel.is_active.is_(True),
        )
        .first()
    )


def get_channel_by_external_id(db: Session, channel_type: str, external_account_id: str) -> Optional[AgentChannel]:
    """O(1) lookup via UNIQUE(channel_type, external_account_id) index."""
    return (
        db.query(AgentChannel)
        .filter(
            AgentChannel.channel_type == channel_type,
            AgentChannel.external_account_id == external_account_id,
            AgentChannel.is_active.is_(True),
        )
        .first()
    )


def add_channel(
    db: Session,
    agent_id: int,
    channel_type: str,
    external_account_id: str,
    credentials: dict,
    page_id: Optional[str] = None,
    waba_id: Optional[str] = None,
    verify_token: Optional[str] = None,
) -> AgentChannel:
    """Add a new channel to an agent with mutex enforcement via advisory lock.

    The pg_advisory_xact_lock serialises all channel changes for this agent,
    preventing races when two requests try to add channels simultaneously.

    Raises:
        ChannelConflictError: If trying to add WA Meta when WaSender is active (or vice versa).
    """
    db.execute(text("SELECT pg_advisory_xact_lock(:agent_id)"), {"agent_id": agent_id})

    # Enforce WhatsApp mutex: can't have WaSender + WA Meta simultaneously
    if channel_type in {ct.value for ct in WHATSAPP_CHANNEL_TYPES}:
        for wa_type in WHATSAPP_CHANNEL_TYPES:
            if wa_type.value == channel_type:
                continue
            existing = (
                db.query(AgentChannel)
                .filter(
                    AgentChannel.agent_id == agent_id,
                    AgentChannel.channel_type == wa_type.value,
                    AgentChannel.is_active.is_(True),
                )
                .first()
            )
            if existing:
                raise ChannelConflictError(
                    f"Agent already has active {existing.channel_type}. "
                    f"Disable it before adding {channel_type}."
                )

    channel = AgentChannel(
        agent_id=agent_id,
        channel_type=channel_type,
        external_account_id=external_account_id,
        credentials_encrypted=encrypt_credentials(credentials),
        page_id=page_id,
        waba_id=waba_id,
        verify_token=verify_token,
        is_active=True,
        health_status="unknown",
    )
    db.add(channel)
    db.flush()
    return channel


def update_credentials(db: Session, channel: AgentChannel, credentials: dict) -> None:
    """Re-encrypt and update credentials for a channel."""
    channel.credentials_encrypted = encrypt_credentials(credentials)
    db.flush()


def get_credentials(channel: AgentChannel) -> dict:
    """Decrypt and return credentials for a channel."""
    return decrypt_credentials(channel.credentials_encrypted)


def toggle_active(db: Session, channel_id: int, is_active: bool) -> AgentChannel:
    channel = get_channel(db, channel_id)
    if not channel:
        raise ChannelNotFoundError(f"Channel {channel_id} not found")
    channel.is_active = is_active
    db.flush()
    return channel


def update_health(db: Session, channel: AgentChannel, status: str) -> None:
    from datetime import datetime
    channel.health_status = status
    channel.last_health_check_at = datetime.utcnow()
    db.flush()
