'use client';

import { SpeechFrame } from './SpeechFrame';

export function TypingBubble({ label }: { label?: string | null }) {
  return (
    <div className="flex justify-start try-bubble-in">
      <SpeechFrame mine={false} tailed>
        <div className="flex items-center gap-2.5">
          <span className="try-eq" aria-hidden>
            <i /><i /><i /><i />
          </span>
          {label ? (
            <span className="text-[12px] text-white/60 leading-none">{label}…</span>
          ) : null}
        </div>
      </SpeechFrame>
    </div>
  );
}
