"""Centralized enums for type safety and consistency."""
from enum import Enum


class Provider(str, Enum):
    """WhatsApp provider types."""
    META = "meta"
    WASENDER = "wasender"


class MessageType(str, Enum):
    """Message content types."""
    TEXT = "text"
    AUDIO = "audio"
    VOICE = "voice"
    IMAGE = "image"


class AppointmentStatus(str, Enum):
    """Appointment status values."""
    SCHEDULED = "scheduled"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class ReminderStatus(str, Enum):
    """Reminder status values."""
    PENDING = "pending"
    PROCESSING = "processing"
    SENT = "sent"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ReminderChannel(str, Enum):
    """Reminder delivery channel."""
    WHATSAPP = "whatsapp"
    WEBHOOK = "webhook"
    BOTH = "both"


class ReminderContentType(str, Enum):
    """Reminder content generation type."""
    TEMPLATE = "template"
    AI = "ai"
    META_TEMPLATE = "meta_template"


class FollowupStatus(str, Enum):
    """Follow-up status values."""
    PENDING = "pending"
    EVALUATING = "evaluating"
    SENT = "sent"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"


class SummaryWebhookStatus(str, Enum):
    """Summary webhook delivery status."""
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
