'use client';

import { BUBBLE_AGENT, bubbleRadii } from './bubbleShape';

export function TypingBubble({ label }: { label?: string | null }) {
  return (
    <div className="flex justify-start mb-1.5 try-bubble-in">
      <div
        className="relative"
        style={{ color: BUBBLE_AGENT }}
      >
        <div
          className="px-3.5 py-2.5 flex items-center gap-2.5"
          style={{
            borderRadius: bubbleRadii('typing', false),
            backgroundColor: BUBBLE_AGENT,
          }}
        >
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
        <svg
          className="absolute bottom-0 right-0 translate-x-[7px] w-[9px] h-[13px] pointer-events-none"
          viewBox="0 0 9 13"
          aria-hidden
        >
          <path fill="currentColor" d="M0 0c2.8 6.5 6.2 11.2 9 13H0V0z" />
        </svg>
      </div>
    </div>
  );
}
