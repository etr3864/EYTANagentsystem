interface AgentAvatarProps {
  name: string;
  active: boolean;
  size?: 'sm' | 'md';
}

export function AgentAvatar({ name, active, size = 'md' }: AgentAvatarProps) {
  const letter = (name.trim()[0] || '?').toUpperCase();
  const box = size === 'sm'
    ? 'w-8 h-8 md:w-10 md:h-10 text-sm'
    : 'w-10 h-10 md:w-12 md:h-12 text-base';

  return (
    <div
      className={`
        ${box} rounded-xl flex items-center justify-center font-semibold shrink-0
        ${active ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-700/50 text-slate-400'}
      `}
    >
      {letter}
    </div>
  );
}
