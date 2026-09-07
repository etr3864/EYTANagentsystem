export interface ModelDef {
  key: string;
  label: string;
  description: string;
  provider: 'Anthropic' | 'OpenAI' | 'Google';
  inputPrice: number;
  outputPrice: number;
  thinkingOptions: string[];
  defaultThinking: string;
}

export const DEFAULT_MODEL = 'claude-sonnet-5';

export const MODEL_PROVIDERS = [
  { provider: 'Anthropic' as const, icon: '🧠' },
  { provider: 'OpenAI' as const, icon: '🤖' },
  { provider: 'Google' as const, icon: '✨' },
] as const;

export const MODEL_ALIASES: Record<string, string> = {
  'gpt-5.2-chat-latest': 'gpt-5.6-luna',
  'gpt-5.1-chat-latest': 'gpt-5.6-luna',
  'gpt-5-chat-latest': 'gpt-5.6-luna',
  'gpt-4o': 'gpt-5.6-luna',
  'gpt-4o-mini': 'gpt-5.6-luna',
  'gpt-4.1': 'gpt-5.6-terra',
  'claude-sonnet-4-20250514': 'claude-sonnet-4-6',
  'claude-opus-4-6': 'claude-opus-5',
  'gemini-3.1-pro-preview': 'gemini-3.8-flash',
  'gemini-2.5-pro': 'gemini-3.8-flash',
  'gemini-2.0-flash': 'gemini-3.8-flash',
  'gemini-3.5-flash': 'gemini-3.8-flash',
};

export const THINKING_LABELS: Record<string, string> = {
  off: 'כבוי',
  minimal: 'מינימלית',
  low: 'נמוכה',
  medium: 'בינונית',
  high: 'גבוהה',
};

export const ALL_MODELS: ModelDef[] = [
  { key: 'claude-sonnet-5', label: 'Claude Sonnet 5', description: 'מומלץ — הדור החדש', provider: 'Anthropic', inputPrice: 2, outputPrice: 10, thinkingOptions: ['off', 'low', 'medium', 'high'], defaultThinking: 'off' },
  { key: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', description: 'מאוזן וחכם', provider: 'Anthropic', inputPrice: 3, outputPrice: 15, thinkingOptions: ['off', 'low', 'medium', 'high'], defaultThinking: 'off' },
  { key: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', description: 'מהיר וחסכוני', provider: 'Anthropic', inputPrice: 1, outputPrice: 5, thinkingOptions: [], defaultThinking: 'off' },
  { key: 'claude-opus-5', label: 'Claude Opus 5', description: 'הכי חזק — יקר', provider: 'Anthropic', inputPrice: 5, outputPrice: 25, thinkingOptions: ['off', 'low', 'medium', 'high'], defaultThinking: 'off' },
  { key: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', description: 'מהיר וזול (Chat)', provider: 'OpenAI', inputPrice: 0.2, outputPrice: 1.2, thinkingOptions: [], defaultThinking: 'off' },
  { key: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', description: 'מאוזן, לכלים', provider: 'OpenAI', inputPrice: 2, outputPrice: 12, thinkingOptions: [], defaultThinking: 'off' },
  { key: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', description: 'הכי חדש — מחיר השקה', provider: 'Google', inputPrice: 0.75, outputPrice: 3.75, thinkingOptions: ['low', 'medium', 'high'], defaultThinking: 'low' },
  { key: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', description: 'יציב, סוכנים וכלים', provider: 'Google', inputPrice: 0.75, outputPrice: 3.75, thinkingOptions: ['low', 'medium', 'high'], defaultThinking: 'low' },
  { key: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', description: 'תומך גם בחשיבה מינימלית', provider: 'Google', inputPrice: 0.75, outputPrice: 3.75, thinkingOptions: ['minimal', 'low', 'medium', 'high'], defaultThinking: 'low' },
];

export function resolveModel(key: string | undefined | null): string {
  if (!key) return DEFAULT_MODEL;
  return MODEL_ALIASES[key] || key;
}

export function getModel(key: string | undefined | null): ModelDef {
  const resolved = resolveModel(key);
  return ALL_MODELS.find((m) => m.key === resolved) ?? ALL_MODELS[0];
}

function usd(amount: number): string {
  return `\u2066$${amount}\u2069`;
}

export function formatUsdPerMillion(inputPrice: number, outputPrice: number): string {
  return `קלט ${usd(inputPrice)} / פלט ${usd(outputPrice)} לכל מיליון`;
}

export function formatModelPrice(m: ModelDef): string {
  return formatUsdPerMillion(m.inputPrice, m.outputPrice);
}
