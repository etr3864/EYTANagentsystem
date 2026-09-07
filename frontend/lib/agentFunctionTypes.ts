export type ParamSource =
  | 'ask'
  | 'user.phone'
  | 'user.name'
  | 'saved'
  | 'event'
  | 'conversation.summary';

export interface AgentFunctionParam {
  name: string;
  type: 'string' | 'integer' | 'number' | 'boolean';
  required: boolean;
  description: string;
  source: ParamSource;
  source_key?: string | null;
}

export interface AgentFunctionOutput {
  json_path: string;
  save_as: string;
  scope: 'conversation' | 'user';
}

export const EVENT_TYPE_OPTIONS = [
  { value: 'appointment.created', label: 'פגישה נקבעה' },
  { value: 'appointment.updated', label: 'פגישה עודכנה' },
  { value: 'appointment.cancelled', label: 'פגישה בוטלה' },
] as const;

export interface AgentFunction {
  id: number;
  agent_id: number;
  name: string;
  when_to_use: string;
  when_not_to_use: string;
  response_instructions: string;
  side_effect: 'read' | 'write';
  trigger: 'conversation' | 'event';
  event_type: string | null;
  method: string;
  url: string;
  allowed_host: string;
  headers: Record<string, string>;
  body_template: string | null;
  params: AgentFunctionParam[];
  outputs: AgentFunctionOutput[];
  timeout_ms: number;
  sort_order: number;
  enabled: boolean;
  test_passed_at: string | null;
  test_was_live: boolean;
  can_enable: boolean;
  created_at: string | null;
}

export interface FunctionUpsert {
  name: string;
  when_to_use: string;
  when_not_to_use: string;
  response_instructions: string;
  side_effect: 'read' | 'write';
  trigger: 'conversation' | 'event';
  event_type: string | null;
  method: string;
  url: string;
  headers: Record<string, string>;
  body_template: string | null;
  params: AgentFunctionParam[];
  outputs: AgentFunctionOutput[];
  timeout_ms: number;
  sort_order: number;
}

export interface FunctionTestResult {
  ok: boolean;
  dry: boolean;
  status_code: number | null;
  latency_ms: number;
  request: { method: string; url: string; headers: Record<string, string>; body: string | null } | null;
  response: unknown;
  mapped_outputs: Record<string, unknown>;
  error?: { code: string; message_for_model: string; customer_hint?: string };
}

export const EMPTY_FUNCTION: FunctionUpsert = {
  name: '',
  when_to_use: '',
  when_not_to_use: '',
  response_instructions: '',
  side_effect: 'read',
  trigger: 'conversation',
  event_type: null,
  method: 'GET',
  url: 'https://',
  headers: {},
  body_template: '{}',
  params: [],
  outputs: [],
  timeout_ms: 8000,
  sort_order: 0,
};

export function toUpsert(fn: AgentFunction): FunctionUpsert {
  return {
    name: fn.name,
    when_to_use: fn.when_to_use,
    when_not_to_use: fn.when_not_to_use,
    response_instructions: fn.response_instructions,
    side_effect: fn.side_effect,
    trigger: fn.trigger,
    event_type: fn.event_type,
    method: fn.method,
    url: fn.url,
    headers: fn.headers || {},
    body_template: fn.body_template,
    params: fn.params || [],
    outputs: fn.outputs || [],
    timeout_ms: fn.timeout_ms,
    sort_order: fn.sort_order,
  };
}
