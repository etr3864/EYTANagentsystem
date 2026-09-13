'use client';

export function TypingBubble() {
  return (
    <div className="flex justify-start mb-1.5">
      <div className="bg-[#1c2230] rounded-[18px] rounded-br-md px-3.5 py-3 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-white/45 animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-white/45 animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-white/45 animate-bounce" />
      </div>
    </div>
  );
}
