'use client';

export function agentHue(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % 360;
}

export function AgentAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const hue = agentHue(name);
  const letter = (name.trim()[0] || '•').toUpperCase();
  return (
    <div
      className="shrink-0 rounded-full grid place-items-center font-semibold text-white shadow-inner"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(145deg, hsl(${hue} 42% 42%), hsl(${hue} 38% 28%))`,
      }}
      aria-hidden
    >
      {letter}
    </div>
  );
}
