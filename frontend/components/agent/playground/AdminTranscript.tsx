'use client';

import { FunctionNote } from '@/components/chat/FunctionNote';
import { EscalationNote } from '@/components/chat/EscalationNote';
import { MessageMedia, bubbleText } from '@/components/chat/MessageMedia';
import { ReplyQuote } from '@/components/chat/ReplyQuote';
import { Button } from '@/components/ui';
import { parseUTCDate } from '@/lib/dates';
import type { PlaygroundAdminMessage } from '@/lib/api/playground';
import type { Message, MessageType } from '@/lib/types';

function asMessage(msg: PlaygroundAdminMessage): Message {
  return {
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: msg.content || '',
    message_type: (msg.message_type || 'text') as MessageType,
    media_id: null,
    media_url: msg.media_url,
    reply_to_text: msg.reply_to,
    created_at: msg.created_at,
  };
}

export function AdminBubble({ msg }: { msg: PlaygroundAdminMessage }) {
  const mapped = asMessage(msg);
  const isUser = mapped.role === 'user';
  const kind = mapped.message_type;
  const isFunction = kind === 'function';
  const isEscalation = kind === 'escalation';
  const isTrigger = kind === 'trigger_data';
  const centered = isFunction || isEscalation || isTrigger;
  const display = bubbleText(mapped);
  const at = parseUTCDate(mapped.created_at);
  const captionUnderMedia = (kind === 'image' || kind === 'video') && !!mapped.media_url;

  return (
    <div className={`flex ${centered ? 'justify-center' : isUser ? 'justify-start' : 'justify-end'}`}>
      <div className={isFunction
        ? 'w-fit max-w-[min(90%,28rem)]'
        : `max-w-[75%] px-4 py-2.5 rounded-2xl ${
            isUser ? 'bg-emerald-600/20 text-emerald-50' : 'bg-slate-700/50 text-slate-100'
          }`
      }>
        {isEscalation && <EscalationNote content={display} />}
        {isFunction && <FunctionNote content={msg.content} />}
        {isTrigger && (
          <div className="text-amber-300 text-xs mb-2 pb-2 border-b border-amber-500/20">
            מידע שנכנס לסוכן · לא נשלח ללקוח
          </div>
        )}
        {!isFunction && mapped.reply_to_text && <ReplyQuote text={mapped.reply_to_text} />}
        {!isFunction && <MessageMedia msg={mapped} displayContent={display} />}
        {display && !isEscalation && !isFunction && !captionUnderMedia && (
          <div className="text-sm whitespace-pre-wrap leading-relaxed">{display}</div>
        )}
        {at && !isFunction && (
          <div className="text-[10px] mt-1.5 text-slate-500">
            {at.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
}

export function SessionDivider({ at, live }: { at: string | null; live: boolean }) {
  const date = parseUTCDate(at);
  const label = live
    ? 'שיחה פעילה'
    : `איפוס שיחה · ${date ? date.toLocaleString('he-IL') : ''}`;
  return (
    <div className="flex items-center justify-center my-4">
      <span className="text-[11px] text-slate-400 bg-slate-800/80 px-3 py-1 rounded-full border border-slate-700">
        {label}
      </span>
    </div>
  );
}

export function ExportButton({
  busy,
  onClick,
}: {
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex justify-end mb-2">
      <Button variant="secondary" size="sm" disabled={busy} onClick={onClick}>
        ייצוא JSON
      </Button>
    </div>
  );
}
