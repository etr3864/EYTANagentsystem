from typing import Optional
from pydantic import BaseModel


# ============ WEBHOOK SCHEMAS ============

class TextContent(BaseModel):
    body: str


class AudioContent(BaseModel):
    id: str
    mime_type: str


class ImageContent(BaseModel):
    id: str
    mime_type: str


class WebhookMessage(BaseModel):
    from_: str
    id: str
    timestamp: str
    type: str
    text: Optional[TextContent] = None
    audio: Optional[AudioContent] = None
    image: Optional[ImageContent] = None

    def __init__(self, **data):
        if "from" in data:
            data["from_"] = data.pop("from")
        super().__init__(**data)


class ContactProfile(BaseModel):
    name: str


class Contact(BaseModel):
    profile: Optional[ContactProfile] = None
    wa_id: str


class Metadata(BaseModel):
    display_phone_number: str
    phone_number_id: str


class Value(BaseModel):
    messaging_product: str
    metadata: Metadata
    messages: Optional[list[WebhookMessage]] = None
    contacts: Optional[list[Contact]] = None


class Change(BaseModel):
    value: Value
    field: str


class Entry(BaseModel):
    id: str
    changes: list[Change]


class WebhookPayload(BaseModel):
    object: str
    entry: list[Entry]


# ============ AGENT CONFIG ============

class AgentBatchingConfig(BaseModel):
    """Configuration for message batching and history."""
    debounce_seconds: int = 3
    max_batch_messages: int = 10
    max_history_messages: int = 20


class WaSenderConfig(BaseModel):
    """WA Sender provider configuration."""
    api_key: str = ""
    webhook_secret: str = ""
    session: str = "default"


# ============ AGENT SCHEMAS ============

class AgentCreate(BaseModel):
    name: str
    phone_number_id: str = ""  # Required for meta, optional for wasender
    access_token: str = ""     # Required for meta, optional for wasender
    verify_token: str = ""     # Required for meta, optional for wasender
    system_prompt: str
    model: str = "claude-sonnet-4-20250514"
    provider: str = "meta"     # "meta" or "wasender"
    provider_config: Optional[dict] = None  # WaSenderConfig for wasender
    batching_config: AgentBatchingConfig = AgentBatchingConfig()


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    phone_number_id: Optional[str] = None
    access_token: Optional[str] = None
    verify_token: Optional[str] = None
    system_prompt: Optional[str] = None
    appointment_prompt: Optional[str] = None
    model: Optional[str] = None
    is_active: Optional[bool] = None
    provider: Optional[str] = None
    provider_config: Optional[dict] = None
    batching_config: Optional[AgentBatchingConfig] = None
    media_config: Optional[dict] = None
    custom_api_keys: Optional[dict] = None
    context_summary_config: Optional[dict] = None


class AgentResponse(BaseModel):
    id: int
    name: str
    phone_number_id: str
    access_token: str
    verify_token: str
    system_prompt: str
    model: str
    is_active: bool
    provider: str = "meta"
    provider_config: Optional[dict] = None
    batching_config: AgentBatchingConfig
    created_at: Optional[str] = None

    class Config:
        from_attributes = True


# ============ CONVERSATION SCHEMAS ============

class ConversationResponse(BaseModel):
    id: int
    user_phone: str
    user_name: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class MessageResponse(BaseModel):
    role: str
    content: str
    message_type: str = "text"
    created_at: Optional[str] = None


# ============ DATABASE SCHEMAS ============

class DbConversationResponse(BaseModel):
    id: int
    agent_id: int
    user_phone: str
    user_name: Optional[str] = None
    updated_at: Optional[str] = None


class DbMessageResponse(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    message_type: str = "text"
    created_at: Optional[str] = None


# ============ SEND MESSAGE ============

class SendMessageRequest(BaseModel):
    text: str
