'use client';

export function AgentStatus({
  status,
  locked,
}: {
  status: string | null;
  locked: boolean;
}) {
  if (locked && !status) {
    return <p className="text-[12px] h-4 text-white/40 truncate">השיחה הסתיימה</p>;
  }
  if (!status) {
    return (
      <p className="text-[12px] h-4 text-emerald-400/75 truncate flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
        אונליין
      </p>
    );
  }
  return (
    <p className="text-[13px] h-4 text-[#5ee0bd] font-medium truncate flex items-center gap-1.5">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inset-0 rounded-full bg-[#5ee0bd] animate-ping opacity-60" />
        <span className="relative w-2 h-2 rounded-full bg-[#5ee0bd]" />
      </span>
      {status}…
    </p>
  );
}
