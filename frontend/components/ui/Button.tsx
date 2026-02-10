'use client';

import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

const variants = {
  primary: `
    bg-gradient-to-r from-blue-600 to-blue-500 
    hover:from-blue-500 hover:to-blue-400 
    text-white shadow-md hover:shadow-lg
    active:scale-[0.98]
  `,
  secondary: `
    bg-slate-700/50 hover:bg-slate-600/50 
    text-slate-200 border border-slate-600
    hover:border-slate-500
    active:scale-[0.98]
  `,
  success: `
    bg-gradient-to-r from-emerald-600 to-emerald-500 
    hover:from-emerald-500 hover:to-emerald-400 
    text-white shadow-md hover:shadow-lg
    active:scale-[0.98]
  `,
  danger: `
    bg-gradient-to-r from-red-600 to-red-500 
    hover:from-red-500 hover:to-red-400 
    text-white shadow-md hover:shadow-lg
    active:scale-[0.98]
  `,
  ghost: `
    bg-transparent hover:bg-slate-700/50 
    text-slate-300 hover:text-white
    active:scale-[0.98]
  `,
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    variant = 'primary', 
    size = 'md', 
    loading = false,
    icon,
    className = '', 
    disabled,
    children, 
    ...props 
  }, ref) => {
    const isDisabled = disabled || loading;
    
    return (
      <button
        ref={ref}
        className={`
          inline-flex items-center justify-center whitespace-nowrap
          font-medium rounded-lg
          transition-all duration-200 ease-out
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900
          disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none
          ${variants[variant]} 
          ${sizes[size]} 
          ${className}
        `}
        disabled={isDisabled}
        {...props}
      >
        {loading ? (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle 
              className="opacity-25" 
              cx="12" cy="12" r="10" 
              stroke="currentColor" 
              strokeWidth="4"
              fill="none"
            />
            <path 
              className="opacity-75" 
              fill="currentColor" 
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : icon ? (
          <span className="flex-shrink-0">{icon}</span>
        ) : null}
        {children && <span className="inline-flex items-center gap-1.5">{children}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
