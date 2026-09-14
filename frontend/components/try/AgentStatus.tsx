'use client';

export function AgentStatus({ locked }: { locked: boolean }) {
  if (locked) {
    return <p className="text-[12px] h-4 text-white/40 truncate">השיחה הסתיימה</p>;
  }
  return (
    <p className="text-[12px] h-4 text-white/55 truncate flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
      אונליין
    </p>
  );
}
