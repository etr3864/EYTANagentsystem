'use client';

export function ReplyQuote({ text }: { text: string }) {
  return (
    <div className="mb-2 pr-2 border-r-2 border-white/30 text-xs opacity-80">
      <div className="text-[10px] uppercase tracking-wide mb-0.5 opacity-70">השבה</div>
      <div className="line-clamp-3 whitespace-pre-wrap">{text}</div>
    </div>
  );
}
