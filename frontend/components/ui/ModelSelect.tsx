'use client';

import { SelectHTMLAttributes, forwardRef } from 'react';
import { ALL_MODELS, MODEL_PROVIDERS } from '@/lib/models';

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
            {MODEL_PROVIDERS.map(({ provider, icon }) => {
              const models = ALL_MODELS.filter((m) => m.provider === provider);
              return (
                <optgroup 
                  key={provider} 
                  label={`${icon} ${provider}`}
                  className="bg-slate-800 text-white"
                >
                  {models.map(model => (
                    <option 
                      key={model.key} 
                      value={model.key}
                      className="bg-slate-800 text-white"
                    >
                      {model.label} - {model.description}
                    </option>
                  ))}
                </optgroup>
              );
            })}
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
