from backend.models.user import User, Gender
from backend.models.agent import Agent
from backend.models.conversation import Conversation
from backend.models.message import Message
from backend.models.knowledge import Document, DocumentChunk, DataTable, DataRow
from backend.models.appointment import Appointment
from backend.models.processed_message import ProcessedMessage
from backend.models.scheduled_reminder import ScheduledReminder
from backend.models.conversation_summary import ConversationSummary
from backend.models.agent_media import AgentMedia
from backend.models.scheduled_followup import ScheduledFollowup
from backend.models.conversation_context_summary import ConversationContextSummary

# Auth models (imported last to avoid circular imports)
from backend.auth.models import AuthUser, UserRole
