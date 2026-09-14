'use client';

export function AgentAvatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <div
      className="try-avatar shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={name}
    >
      <svg viewBox="0 0 64 64" className="try-net" aria-hidden>
        <g className="try-net-links">
          <path d="M32 32L18 16" />
          <path d="M32 32L46 15" />
          <path d="M32 32L52 32" />
          <path d="M32 32L47 49" />
          <path d="M32 32L18 48" />
          <path d="M32 32L12 32" />
          <path d="M32 32L32 12" />
          <path d="M32 32L32 52" />
          <path d="M18 16L46 15" />
          <path d="M46 15L52 32" />
          <path d="M52 32L47 49" />
          <path d="M18 48L12 32" />
          <path d="M12 32L18 16" />
          <path d="M18 48L47 49" />
        </g>
        <g className="try-net-nodes">
          <circle cx="18" cy="16" r="2.1" />
          <circle cx="46" cy="15" r="2.2" />
          <circle cx="52" cy="32" r="2.4" />
          <circle cx="47" cy="49" r="2.1" />
          <circle cx="18" cy="48" r="2.2" />
          <circle cx="12" cy="32" r="2" />
          <circle cx="32" cy="12" r="1.9" />
          <circle cx="32" cy="52" r="2" />
          <circle className="try-net-core" cx="32" cy="32" r="3.4" />
        </g>
      </svg>
    </div>
  );
}
