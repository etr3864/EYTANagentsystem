'use client';

import { useEffect, useState } from 'react';
import { clearHold, clearPhoneSilence, getChatSilence, type ChatSilence } from '@/lib/api/silence';
import { parseUTCDate } from '@/lib/dates';

export function SilenceBar({
  agentId,
  conversationId,
  refreshKey,
}: {
  agentId: number;
  conversationId: number;
  refreshKey: number;
}) {
  const [status, setStatus] = useState<ChatSilence | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    getChatSilence(agentId, conversationId)
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, conversationId, refreshKey]);

  useEffect(() => {
    if (!status?.phone_active || status.phone_forever) return;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [status?.phone_active, status?.phone_forever]);

  if (!status) return null;
  const left = status.phone_forever ? 'עד שתחזיר' : timeLeft(status.phone_until, now);
  const phoneOn = status.phone_active && (status.phone_forever || Boolean(left));
  if (!phoneOn && !status.on_blocklist) return null;

  async function releasePhone() {
    setStatus(await clearPhoneSilence(agentId, conversationId));
  }

  async function releaseHold() {
    setStatus(await clearHold(agentId, conversationId));
  }

  return (
    <div className="space-y-1 border-b border-[var(--edge)] px-4 py-2 text-xs">
      {phoneOn && (
        <Line
          text={left ? `שותק אחרי הודעה מהטלפון · ${left}` : 'שותק אחרי הודעה מהטלפון'}
          action="בטל שתיקה"
          onClick={releasePhone}
        />
      )}
      {status.on_blocklist && (
        <Line text="ברשימת המספרים" action="החזר לסוכן" onClick={releaseHold} />
      )}
    </div>
  );
}

function Line({ text, action, onClick }: { text: string; action: string; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--ink)]">{text}</span>
      <button type="button" className="text-[var(--acc)]" onClick={onClick}>
        {action}
      </button>
    </div>
  );
}

function timeLeft(until: string | null, now: number): string {
  const at = parseUTCDate(until);
  if (!at) return '';
  const mins = Math.ceil((at.getTime() - now) / 60000);
  if (mins <= 0) return '';
  if (mins < 60) return `עוד ${mins} דק׳`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `עוד ${hours} שע׳ ו־${rest} דק׳` : `עוד ${hours} שע׳`;
}
