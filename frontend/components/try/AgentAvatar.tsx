'use client';

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 1);
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`;
}

export function AgentAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const letters = initials(name);
  return (
    <div
      className="try-avatar shrink-0 grid place-items-center"
      style={{ width: size, height: size, fontSize: Math.max(13, Math.round(size * 0.34)) }}
      role="img"
      aria-label={name}
    >
      {letters}
    </div>
  );
}
