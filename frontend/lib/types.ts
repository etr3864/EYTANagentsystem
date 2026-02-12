// ============ Agent Config ============
export interface AgentBatchingConfig {
  debounce_seconds: number;
  max_batch_messages: number;
  max_history_messages: number;
}

// ============ Provider Config ============
export type Provider = 'meta' | 'wasender';

export interface WaSenderConfig {
  api_key: string;
  webhook_secret: string;
  session: string;
}

// ============ Agent ============
export interface Agent {
  id: number;
  name: string;
  phone_number_id: string;
  access_token: string;
  verify_token: string;
  system_prompt: string;
  appointment_prompt: string | null;
  model: string;
  is_active: boolean;
  provider: Provider;
  provider_config: WaSenderConfig | Record<string, never>;
  batching_config: AgentBatchingConfig;
  calendar_config: Record<string, unknown> | null;
  media_config: MediaConfig | null;
  created_at: string | null;
}

export interface AgentCreate {
  name: string;
  phone_number_id: string;
  access_token: string;
  verify_token: string;
  system_prompt: string;
  model: string;
  provider?: Provider;
  provider_config?: WaSenderConfig | Record<string, never>;
  batching_config?: AgentBatchingConfig;
}

export interface AgentUpdate {
  name?: string;
  phone_number_id?: string;
  access_token?: string;
  verify_token?: string;
  system_prompt?: string;
  appointment_prompt?: string;
  model?: string;
  is_active?: boolean;
  provider?: Provider;
  provider_config?: WaSenderConfig | Record<string, never>;
  batching_config?: AgentBatchingConfig;
  media_config?: MediaConfig | null;
}

// ============ User ============
export type Gender = 'male' | 'female' | 'unknown';

export interface User {
  id: number;
  phone: string;
  name: string | null;
  gender: Gender;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
}

// ============ Conversation ============
export interface Conversation {
  id: number;
  user_id: number;
  user_phone: string;
  user_name: string | null;
  user_gender: Gender | null;
  is_paused: boolean;
  created_at: string | null;
  updated_at: string | null;
}

// ============ Message ============
export type MessageType = 'text' | 'voice' | 'image' | 'video' | 'media' | 'manual';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  message_type: MessageType;
  media_id: number | null;
  media_url: string | null;
  created_at: string | null;
}

// ============ Database Views ============
export interface DbConversation {
  id: number;
  agent_id: number;
  user_id: number;
  user_phone: string | null;
  user_name: string | null;
  updated_at: string | null;
}

export interface DbMessage {
  id: number;
  conversation_id: number;
  role: string;
  content: string;
  message_type: MessageType;
  media_id: number | null;
  media_url: string | null;
  created_at: string | null;
}

// ============ Usage Stats (Cumulative per Agent) ============
export interface UsageStats {
  id: number;  // Artificial id for DataTable
  agent_id: number;
  agent_name: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
}

// ============ Appointments ============
export type AppointmentStatus = 'scheduled' | 'cancelled' | 'completed';

export interface DbAppointment {
  id: number;
  agent_id: number;
  agent_name: string | null;
  user_id: number;
  user_name: string | null;
  user_phone: string | null;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  status: AppointmentStatus;
  google_event_id: string | null;
}

// ============ Reminders ============
export type ReminderStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

export interface DbReminder {
  id: number;
  appointment_id: number;
  appointment_title: string | null;
  agent_id: number;
  agent_name: string | null;
  user_id: number;
  user_name: string | null;
  user_phone: string | null;
  scheduled_for: string | null;
  status: ReminderStatus;
  send_to_customer: boolean;
  send_to_business: boolean;
  channel: string;
  content_type: string;
  sent_at: string | null;
  error_message: string | null;
}

// ============ Conversation Summaries ============
export type SummaryWebhookStatus = 'pending' | 'sent' | 'failed';

export interface DbSummary {
  id: number;
  conversation_id: number;
  agent_id: number;
  agent_name: string | null;
  user_id: number;
  user_name: string | null;
  user_phone: string | null;
  summary_text: string;
  message_count: number;
  webhook_status: SummaryWebhookStatus;
  webhook_attempts: number;
  webhook_last_error: string | null;
  webhook_sent_at: string | null;
  next_retry_at: string | null;
  created_at: string | null;
}

// ============ Knowledge Base ============
export interface Document {
  id: number;
  filename: string;
  file_type: string;
  file_size: number;
  chunk_count: number;
  created_at: string;
}

export interface DataTable {
  id: number;
  name: string;
  description: string | null;
  columns: Record<string, string>;
  row_count: number;
  created_at: string;
}

// ============ Agent Media ============
export type MediaType = 'image' | 'video' | 'document';

export interface AgentMedia {
  id: number;
  agent_id: number;
  media_type: MediaType;
  name: string;
  description: string | null;
  default_caption: string | null;
  filename: string | null;
  file_url: string;
  file_key: string;
  file_size: number;
  original_size: number | null;
  mime_type: string | null;
  is_active: boolean;
  created_at: string | null;
}

export interface DbMedia {
  id: number;
  agent_id: number;
  agent_name: string | null;
  media_type: MediaType;
  name: string;
  description: string | null;
  filename: string | null;
  file_url: string;
  file_size: number;
  original_size: number | null;
  mime_type: string | null;
  is_active: boolean;
  created_at: string | null;
}

export interface MediaConfig {
  enabled: boolean;
  max_per_message: number;
  allow_duplicate_in_conversation: boolean;
  instructions: string;
}

// ============ WhatsApp Templates ============
export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export type TemplateStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED';

export interface WhatsAppTemplate {
  id: number;
  agent_id: number;
  meta_template_id: string;
  name: string;
  language: string;
  category: TemplateCategory;
  status: TemplateStatus;
  reject_reason: string | null;
  components: Record<string, unknown>[];
  header_media_url: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface DbTemplate {
  id: number;
  agent_id: number;
  agent_name: string | null;
  name: string;
  language: string;
  category: TemplateCategory;
  status: TemplateStatus;
  created_at: string | null;
}
