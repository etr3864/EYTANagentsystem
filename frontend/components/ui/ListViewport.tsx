'use client';

export const BELOW_NAV_CLASS = 'h-[calc(100dvh-4rem)] overflow-hidden';

export function ListViewport({
  children,
  footer,
  className = '',
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`}>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>
      {footer ? <div className="shrink-0 border-t border-purple-500/10 pt-3 mt-3">{footer}</div> : null}
    </div>
  );
}
