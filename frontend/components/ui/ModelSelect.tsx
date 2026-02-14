'use client';

import { SelectHTMLAttributes, forwardRef } from 'react';

interface ModelOption {
  value: string;
  label: string;
  description: string;
}

interface ModelGroup {
  provider: string;
  icon: string;
  models: ModelOption[];
}

const MODEL_GROUPS: ModelGroup[] = [
  {
    provider: 'Anthropic',
    icon: '🧠',
    models: [
      { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', description: 'מומלץ - מאוזן וחכם' },
      { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', description: 'יציב ומוכח' },
      { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', description: 'מהיר וחסכוני' },
      { value: 'claude-opus-4-6', label: 'Claude Opus 4.6', description: 'הכי חזק, יקר' },
    ]
  },
  {
    provider: 'OpenAI',
    icon: '🤖',
    models: [
      { value: 'gpt-5.2-chat-latest', label: 'GPT-5.2', description: 'הכי חזק, הבנה עמוקה' },
      { value: 'gpt-4o', label: 'GPT-4o', description: 'יציב ואיכותי' },
      { value: 'gpt-4.1', label: 'GPT-4.1', description: 'חסכוני, volume גבוה' },
    ]
  },
  {
    provider: 'Google',
    icon: '✨',
    models: [
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', description: 'מהיר וחסכוני, חשיבה מובנית' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', description: 'חכם, reasoning מתקדם' },
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', description: 'מהיר מאוד, זול' },
      { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', description: 'חדש - מאוזן ומהיר (preview)' },
      { value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro', description: 'חדש - הכי חכם (preview)' },
    ]
  }
];

interface ModelSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'options'> {
  label?: string;
  error?: string;
}

const inputBaseStyles = `
  w-full px-4 py-2.5
  bg-slate-800/50 
  border border-slate-600/50 
  rounded-lg
  text-white placeholder-slate-400
  transition-all duration-200
  focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20
  hover:border-slate-500
  disabled:opacity-50 disabled:cursor-not-allowed
`;

export const ModelSelect = forwardRef<HTMLSelectElement, ModelSelectProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="block text-sm font-medium text-slate-300">
            {label}
          </label>
        )}
        <div className="relative">
          <select 
            ref={ref}
            className={`
              ${inputBaseStyles}
              appearance-none cursor-pointer pr-10
              ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''} 
              ${className}
            `} 
            {...props}
          >
            {MODEL_GROUPS.map(group => (
              <optgroup 
                key={group.provider} 
                label={`${group.icon} ${group.provider}`}
                className="bg-slate-800 text-white"
              >
                {group.models.map(model => (
                  <option 
                    key={model.value} 
                    value={model.value}
                    className="bg-slate-800 text-white"
                  >
                    {model.label} - {model.description}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}
      </div>
    );
  }
);

ModelSelect.displayName = 'ModelSelect';
