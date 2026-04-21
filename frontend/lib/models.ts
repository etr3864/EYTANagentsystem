export interface ModelDef {
  key: string;
  label: string;
  description: string;
  provider: 'Anthropic' | 'OpenAI' | 'Google';
}

export const MODEL_PROVIDERS = [
  { provider: 'Anthropic' as const, icon: '🧠' },
  { provider: 'OpenAI' as const, icon: '🤖' },
  { provider: 'Google' as const, icon: '✨' },
] as const;

export const ALL_MODELS: ModelDef[] = [
  { key: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', description: 'מומלץ - מאוזן וחכם', provider: 'Anthropic' },
  { key: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', description: 'יציב ומוכח', provider: 'Anthropic' },
  { key: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', description: 'מהיר וחסכוני', provider: 'Anthropic' },
  { key: 'claude-opus-4-6', label: 'Claude Opus 4.6', description: 'הכי חזק, יקר', provider: 'Anthropic' },
  { key: 'gpt-5.2-chat-latest', label: 'GPT-5.2', description: 'הכי חזק, הבנה עמוקה', provider: 'OpenAI' },
  { key: 'gpt-4o', label: 'GPT-4o', description: 'יציב ואיכותי', provider: 'OpenAI' },
  { key: 'gpt-4.1', label: 'GPT-4.1', description: 'חסכוני, volume גבוה', provider: 'OpenAI' },
  { key: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'מהיר וחסכוני, חשיבה מובנית', provider: 'Google' },
  { key: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'חכם, reasoning מתקדם', provider: 'Google' },
  { key: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', description: 'מהיר מאוד, זול', provider: 'Google' },
  { key: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', description: 'חדש - מאוזן ומהיר (preview)', provider: 'Google' },
  { key: 'gemini-3-pro-preview', label: 'Gemini 3 Pro', description: 'חדש - הכי חכם (preview)', provider: 'Google' },
];
