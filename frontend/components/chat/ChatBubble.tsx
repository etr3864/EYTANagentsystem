'use client';

import type { Message } from '@/lib/types';
import { parseUTCDate } from '@/lib/dates';
import { EscalationNote } from './EscalationNote';
import { FunctionNote } from './FunctionNote';
import { MessageMedia, bubbleText } from './MessageMedia';
import { ReplyQuote } from './ReplyQuote';

const SKIP_QUOTE = new Set(['function', 'escalation', 'trigger_data']);

export function canQuote(msg: Message): boolean {
  return Boolean(msg.id) && !SKIP_QUOTE.has(msg.message_type || 'text');
}

export function quotePreview(msg: Message): string {
  return (bubbleText(msg) || msg.content || '').trim().slice(0, 200) || '[הודעה]';
}

interface ChatBubbleProps {
  msg: Message;
  showDate: boolean;
  onQuote?: (msg: Message) => void;
  onSenderClick?: (phone: string, name: string) => void;
}

export function ChatBubble({ msg, showDate, onQuote, onSenderClick }: ChatBubbleProps) {
  const msgDate = parseUTCDate(msg.created_at);
  const isUser = msg.role === 'user';
  const isImage = msg.message_type === 'image';
  const isVideo = msg.message_type === 'video';
  const isManual = msg.message_type === 'manual';
  const isExternal = msg.message_type === 'external';
  const isTriggerData = msg.message_type === 'trigger_data';
  const isEscalation = msg.message_type === 'escalation';
  const isFunction = msg.message_type === 'function';
  const isCenteredNote = isTriggerData || isEscalation || isFunction;
  const quoting = Boolean(onQuote && canQuote(msg));
  const displayContent = bubbleText(msg);
  const captionUnderMedia = Boolean(msg.media_too_large) || ((isImage || isVideo) && Boolean(msg.media_url));

  const bubbleStyle = isEscalation
    ? 'ops-bubble ops-bubble-agent border-rose-500/40'
    : isTriggerData
      ? 'ops-bubble ops-bubble-agent border-amber-500/40'
      : isExternal
        ? 'ops-bubble ops-bubble-agent border-orange-500/40'
        : isUser
          ? 'ops-bubble ops-bubble-user'
          : 'ops-bubble ops-bubble-agent';

  return (
    <div>
      {showDate && msgDate && (
        <div className="flex items-center justify-center my-6">
          <div className="bg-[var(--glass)] border border-[var(--edge)] text-[var(--text-muted)] text-[11px] tracking-[0.12em] px-3.5 py-1 rounded-full">
            {msgDate.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      )}
      <div className={`flex ${isCenteredNote ? 'justify-center' : isUser ? 'justify-start' : 'justify-end'}`}>
        <div
          className={`${isFunction ? 'w-fit max-w-[min(90%,28rem)]' : `${isCenteredNote ? 'max-w-[90%]' : ''} ${bubbleStyle}`} ${quoting ? 'cursor-pointer' : ''}`}
          title={quoting ? 'לחץ לציטוט' : undefined}
          onClick={quoting ? () => onQuote?.(msg) : undefined}
        >
          {isEscalation && <EscalationNote content={displayContent} />}
          {isFunction && <FunctionNote content={msg.content} />}
          {isTriggerData && (
            <div className="flex items-center gap-2 text-amber-300 text-xs mb-2 pb-2 border-b border-amber-500/20">
              <span>מידע שנכנס לסוכן · לא נשלח ללקוח</span>
            </div>
          )}
          {isExternal && (
            <div className="flex items-center gap-2 text-orange-300 text-xs mb-2 pb-2 border-b border-orange-500/20">
              <span>נשלח ללקוח מאוטומציה</span>
            </div>
          )}
          {!isFunction && (msg.sender_name || msg.sender_phone) && isUser && (
            onSenderClick && msg.sender_phone ? (
              <button
                type="button"
                className="mb-0.5 text-[11px] font-medium text-[var(--acc)] hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  onSenderClick(msg.sender_phone || '', msg.sender_name || msg.sender_phone || '');
                }}
              >
                {msg.sender_name || msg.sender_phone}
              </button>
            ) : (
              <div className="text-[11px] font-medium text-[var(--acc)] mb-0.5">
                {msg.sender_name || msg.sender_phone}
              </div>
            )
          )}
          {!isFunction && msg.reply_to_text && <ReplyQuote text={msg.reply_to_text} />}
          {!isFunction && (
            <div onClick={(e) => e.stopPropagation()}>
              <MessageMedia msg={msg} displayContent={displayContent} />
            </div>
          )}
          {displayContent && !isEscalation && !isFunction && !captionUnderMedia && (
            <div className="text-sm whitespace-pre-wrap leading-relaxed">
              {displayContent}
            </div>
          )}
          {msgDate && !isFunction && (
            <div className="text-[10px] mt-1.5 flex items-center gap-1 text-[var(--text-muted)]">
              {msgDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
              {!isUser && !isCenteredNote && (
                <>
                  <span className="mr-1">✓✓</span>
                  {isManual && <span className="text-amber-400/60 text-[9px]">• ידני</span>}
                  {isExternal && <span className="text-orange-400/70 text-[9px]">• אוטומציה</span>}
                </>
              )}
              {isTriggerData && <span className="text-amber-400/70 text-[9px]">רק לסוכן</span>}
              {isEscalation && <span className="text-rose-400/70 text-[9px]">פנימי</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
