'use client';

/** One global mark — glass orb, no initials. */
export function AgentAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const core = Math.round(size * 0.32);
  return (
    <div
      className="relative shrink-0 rounded-full overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_8px_24px_rgba(80,30,160,0.35)]"
      style={{ width: size, height: size }}
      role="img"
      aria-label={name}
    >
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,#e9d5ff,transparent_42%),linear-gradient(145deg,#c084fc_0%,#6d28d9_48%,#1e1b4b_100%)]" />
      <span className="absolute inset-[2px] rounded-full bg-gradient-to-tr from-white/30 via-transparent to-black/20" />
      <span
        className="absolute rounded-full bg-white/90 shadow-[0_0_10px_rgba(255,255,255,0.55)] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: core, height: core }}
      />
    </div>
  );
}
