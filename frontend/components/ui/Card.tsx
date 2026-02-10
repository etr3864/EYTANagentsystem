'use client';

import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  style?: React.CSSProperties;
}

const paddingSizes = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export function Card({ 
  children, 
  className = '', 
  hover = false,
  padding = 'md',
  style
}: CardProps) {
  return (
    <div 
      className={`
        bg-slate-800/50 
        border border-slate-700/50 
        rounded-xl
        ${paddingSizes[padding]}
        ${hover ? 'transition-all duration-200 hover:bg-slate-800 hover:border-slate-600 hover:shadow-lg cursor-pointer' : ''}
        ${className}
      `}
      style={style}
    >
      {children}
    </div>
  );
}

// Card Header
interface CardHeaderProps {
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}

export function CardHeader({ children, className = '', action }: CardHeaderProps) {
  return (
    <div className={`flex items-center justify-between pb-4 mb-4 border-b border-slate-700/50 ${className}`}>
      <div className="font-semibold text-lg text-white">{children}</div>
      {action && <div>{action}</div>}
    </div>
  );
}

// Card Title
interface CardTitleProps {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function CardTitle({ children, icon, className = '' }: CardTitleProps) {
  return (
    <h3 className={`flex items-center gap-2 text-lg font-semibold text-white ${className}`}>
      {icon && <span className="text-blue-400">{icon}</span>}
      {children}
    </h3>
  );
}

// Card Description
export function CardDescription({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-sm text-slate-400 ${className}`}>{children}</p>
  );
}
