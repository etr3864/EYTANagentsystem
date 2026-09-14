'use client';

export function AgentAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const core = Math.max(6, Math.round(size * 0.22));
  return (
    <div
      className="relative shrink-0 rounded-full overflow-hidden"
      style={{
        width: size,
        height: size,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.14)',
      }}
      role="img"
      aria-label={name}
    >
      <span
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(158deg, #cbb6e8 0%, #6a4a9a 42%, #231635 100%)',
        }}
      />
      <span
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.22) 0%, transparent 38%, rgba(0,0,0,0.28) 100%)',
        }}
      />
      <span
        className="absolute rounded-full bg-white/90"
        style={{
          width: core,
          height: core,
          left: '34%',
          top: '30%',
        }}
      />
    </div>
  );
}
