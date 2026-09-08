export { API_URL, authFetch } from './client';
export * from './agents';
export * from './conversations';
export * from './db';
export * from './media';
export * from './knowledge';
export * from './authUsers';
export * from './templates';
export * from './followups';
export * from './dashboard';
export * from './triggers';
export * from './mcp';

export type {
  Agent,
  AgentCreate,
  AgentUpdate,
  AgentBatchingConfig,
  ContextSummaryConfig,
  Provider,
  WaSenderConfig,
  CustomApiKeys,
  User,
  Gender,
  Conversation,
  Message,
  DbConversation,
  DbMessage,
  UsageStats,
  DbAppointment,
  DbReminder,
  DbSummary,
  Document,
  DocumentDetail,
  DataTable,
  DataTableDetail,
  DbMedia,
  AgentMedia,
  MediaConfig,
  MediaType,
  WhatsAppTemplate,
  TemplateCategory,
  TemplateStatus,
  DbTemplate,
  FollowupConfig,
  FollowupStep,
  FollowupStats,
  DbFollowup,
  DbChannel,
  DbChannelUser,
  DashboardStats,
  SystemSummary,
  AgentTableRow,
  AgentDetail,
  PricingConfig,
} from '../types';
