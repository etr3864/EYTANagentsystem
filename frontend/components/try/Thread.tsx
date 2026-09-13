'use client';

import { useEffect, useRef } from 'react';
import type { TryBubble } from '@/lib/api/try';
import { Bubble } from './Bubble';
import { TypingBubble } from './TypingBubble';

export function Thread({
  messages,
  closedMessage,
  onReply,
  viewportHeight,
  typing,
}: {
  messages: TryBubble[];
  closedMessage: string | null;
  onReply: (text: string) => void;
  viewportHeight?: number | null;
  typing?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, closedMessage, viewportHeight, typing]);

  return (
    <div
      ref={ref}
      className="flex-1 min-h-0 overflow-y-auto px-3 py-3"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at top, rgba(31,138,112,0.08), transparent 42%), linear-gradient(#0c0e14, #0c0e14)',
      }}
    >
      {messages.length === 0 && !closedMessage && (
        <p className="text-center text-white/35 text-sm mt-16">התחל לכתוב — הסוכן בצד השני</p>
      )}
      {messages.map((msg, i) => {
        const prev = messages[i - 1];
        const showDate = !prev || (msg.created_at || '').slice(0, 10) !== (prev.created_at || '').slice(0, 10);
        return <div key={String(msg.id)} className="mb-1.5"><Bubble msg={msg} showDate={showDate} onReply={onReply} /></div>;
      })}
      {typing && !closedMessage && <TypingBubble />}
      {closedMessage && (
        <div className="flex justify-center my-4">
          <div className="max-w-[88%] rounded-2xl bg-white/[0.06] border border-white/[0.08] px-4 py-3 text-[13.5px] leading-6 text-white/80 text-center">
            {closedMessage}
          </div>
        </div>
      )}
    </div>
  );
}
