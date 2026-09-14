'use client';

export function TypingBubble({ label }: { label?: string | null }) {
  return (
    <div className="flex justify-start mb-1.5 try-bubble-in">
      <div className="try-glass rounded-[22px] px-3.5 py-2.5 flex items-center gap-2.5">
        <span className="try-eq" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
        {label ? (
          <span className="text-[12px] text-white/70 leading-none">{label}…</span>
        ) : null}
      </div>
    </div>
  );
}
