from datetime import datetime
from typing import Optional, TYPE_CHECKING
from sqlalchemy import String, Text, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.orm.attributes import flag_modified
from backend.core.database import Base

if TYPE_CHECKING:
    from backend.auth.models import AuthUser


# Default batching config
DEFAULT_BATCHING_CONFIG = {
    "debounce_seconds": 3,
    "max_batch_messages": 10,
    "max_history_messages": 20,
}


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    phone_number_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    
    # Owner (admin) - NULL means unassigned (only super admin can access)
    owner_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("auth_users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True
    )
    owner: Mapped[Optional["AuthUser"]] = relationship(
        "AuthUser",
        back_populates="agents",
        foreign_keys=[owner_id]
    )
    access_token: Mapped[str] = mapped_column(Text)
    verify_token: Mapped[str] = mapped_column(String(100))
    system_prompt: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(String(50), default="claude-sonnet-4-5")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Provider configuration
    # "meta" = Official WhatsApp Business API (default)
    # "wasender" = WA Sender third-party provider
    provider: Mapped[str] = mapped_column(String(20), default="meta")
    
    # Provider-specific config (JSON)
    # For meta: {} (uses phone_number_id, access_token, verify_token above)
    # For wasender: {"api_key": "...", "webhook_secret": "...", "session": "default"}
    provider_config: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    
    # Batching config (JSON) - settings for message batching
    batching_config: Mapped[Optional[dict]] = mapped_column(JSON, default=DEFAULT_BATCHING_CONFIG)
    
    # Usage stats (JSON) - cumulative token usage per model
    # Format: {"model_name": {"input": N, "output": N, "cache_read": N, "cache_create": N}}
    usage_stats: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    
    # Calendar configuration (JSON)
    # {
    #   "google_tokens": {"access_token": "...", "refresh_token": "...", "expires_at": ...},
    #   "google_calendar_id": "primary",
    #   "working_hours": {"1": {"start": "09:00", "end": "17:00"}, ...},
    #   "default_duration": 30,
    #   "buffer_minutes": 10,
    #   "days_ahead": 14,
    #   "timezone": "Asia/Jerusalem",
    #   "webhook_url": "https://..." (optional)
    # }
    calendar_config: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    
    # Appointment scheduling prompt - instructions for AI on how to handle appointments
    appointment_prompt: Mapped[Optional[str]] = mapped_column(Text, default=None)
    
    # Conversation summary configuration (JSON)
    # {
    #   "enabled": false,
    #   "delay_minutes": 30,  # Time since last customer message to trigger summary
    #   "min_messages": 5,    # Minimum messages required for summary
    #   "webhook_url": "https://...",
    #   "webhook_retry_count": 3,
    #   "webhook_retry_delay": 60,  # Seconds between retries
    #   "summary_prompt": "סכם את השיחה..."  # Prompt for AI summary generation
    # }
    summary_config: Mapped[Optional[dict]] = mapped_column(JSON, default=None)
    
    # Follow-up configuration (JSON) — sequence-based v2
    # {
    #   "enabled": false,
    #   "model": "claude-sonnet-4-5",
    #   "min_messages": 5,
    #   "active_hours": {"start": "09:00", "end": "21:00"},
    #   "sequence": [{"delay_hours": 3, "instruction": ""}, ...],
    #   "meta_templates": [{"name": "...", "language": "he", "params": ["customer_name"]}]
    # }
    followup_config: Mapped[Optional[dict]] = mapped_column(JSON, default=None)

    # Media configuration (JSON)
    # {
    #   "enabled": false,
    #   "max_per_message": 3,  # Max media items in single response
    #   "allow_duplicate_in_conversation": false,  # Allow same media twice in conversation
    #   "instructions": "שלח תמונות כשלקוח מבקש..."  # AI instructions for media usage
    # }
    media_config: Mapped[Optional[dict]] = mapped_column(JSON, default=None)

    # Per-provider API key overrides (optional, for high-consumption agents)
    # {"anthropic": "sk-...", "openai": "sk-...", "google": "AIza-..."}
    custom_api_keys: Mapped[Optional[dict]] = mapped_column(JSON, default=None)

    # Context summary config (JSON) — rolling conversation memory
    # {"enabled": false, "message_threshold": 20, "messages_after_summary": 20, "full_summary_every": 5}
    context_summary_config: Mapped[Optional[dict]] = mapped_column(JSON, default=None)

    conversations: Mapped[list["Conversation"]] = relationship(back_populates="agent", passive_deletes=True)
    appointments: Mapped[list["Appointment"]] = relationship(back_populates="agent", passive_deletes=True)
    
    def get_batching_config(self) -> dict:
        """Get batching configuration with defaults."""
        config = DEFAULT_BATCHING_CONFIG.copy()
        if self.batching_config:
            config.update(self.batching_config)
        return config
    
    def add_usage(self, model: str, input_tokens: int, output_tokens: int, 
                  cache_read: int = 0, cache_create: int = 0) -> None:
        """Add token usage to cumulative stats."""
        if self.usage_stats is None:
            self.usage_stats = {}
        
        if model not in self.usage_stats:
            self.usage_stats[model] = {
                "input": 0, "output": 0, "cache_read": 0, "cache_create": 0
            }
        
        self.usage_stats[model]["input"] += input_tokens
        self.usage_stats[model]["output"] += output_tokens
        self.usage_stats[model]["cache_read"] += cache_read
        self.usage_stats[model]["cache_create"] += cache_create
        
        # Tell SQLAlchemy that the JSON field was modified
        flag_modified(self, "usage_stats")
