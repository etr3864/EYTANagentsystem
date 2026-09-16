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
    bg-[var(--ink)] text-[var(--bg)]
    hover:opacity-90
    active:scale-[0.98]
  `,
  secondary: `
    bg-[var(--glass)] text-[var(--ink)]
    border border-[var(--edge-strong)]
    hover:border-[var(--acc)]
    active:scale-[0.98]
  `,
  success: `
    bg-emerald-600 hover:bg-emerald-500
    text-white
    active:scale-[0.98]
  `,
  danger: `
    bg-red-600 hover:bg-red-500
    text-white
    active:scale-[0.98]
  `,
  ghost: `
    bg-transparent hover:bg-[var(--bg-hover)]
    text-[var(--text-secondary)] hover:text-[var(--text-primary)]
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
          font-medium rounded-2xl
          transition-all duration-200 ease-out
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc)]
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
