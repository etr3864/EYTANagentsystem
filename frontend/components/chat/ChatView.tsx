'use client';

import { useEffect, useRef, useState } from 'react';
import type { Message, WhatsAppTemplate } from '@/lib/types';
import { parseUTCDate } from '@/lib/dates';
import { PauseIcon, PlayIcon } from '@/components/ui/Icons';
import { ChatBubble, canQuote, quotePreview } from './ChatBubble';
import { SilenceBar } from './SilenceBar';
import { Composer, type TemplateSendPayload } from './Composer';
import { getCapabilities } from '@/lib/channels';
import { customerWindowOpen } from '@/lib/whatsappWindow';

interface ChatViewProps {
  messages: Message[];
  conversationId?: number | null;
  isPaused?: boolean;
  channelType?: string | null;
  lastCustomerMessageAt?: string | null;
  templates?: WhatsAppTemplate[];
  onSend?: (text: string, replyToMessageId?: number) => Promise<void>;
  onSendMedia?: (file: File, caption: string, asVoice?: boolean, replyToMessageId?: number) => Promise<void>;
  onSendVoice?: (blob: Blob, replyToMessageId?: number) => Promise<void>;
  onSendTemplate?: (payload: TemplateSendPayload) => Promise<void>;
  onTogglePause?: () => Promise<void>;
  onAddToReplyList?: (name: string, note: string) => Promise<void>;
  replyListName?: string;
  onSenderClick?: (phone: string, name: string) => void;
  agentId?: number;
}

export function ChatView({
  messages,
  conversationId,
  isPaused,
  channelType,
  lastCustomerMessageAt,
  templates = [],
  onSend,
  onSendMedia,
  onSendVoice,
  onSendTemplate,
  onTogglePause,
  onAddToReplyList,
  replyListName = '',
  onSenderClick,
  agentId,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef<number>(0);
  const prevConversationId = useRef<number | null | undefined>(null);
  const [quote, setQuote] = useState<{ id: number; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [listName, setListName] = useState('');
  const [listNote, setListNote] = useState('');
  const [listError, setListError] = useState('');
  const [listBusy, setListBusy] = useState(false);

  useEffect(() => {
    setQuote(null);
    setAdding(false);
    setListName(replyListName);
    setListNote('');
    setListError('');
  }, [conversationId, replyListName]);

  useEffect(() => {
    if (scrollRef.current) {
      const isConversationChange = conversationId !== prevConversationId.current;
      const isInitialLoad = prevMessageCount.current === 0 && messages.length > 0;
      const hasNewMessages = messages.length > prevMessageCount.current;

      if (isConversationChange || isInitialLoad || hasNewMessages) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }

      prevMessageCount.current = messages.length;
      prevConversationId.current = conversationId;
    }
  }, [messages, conversationId]);

  const caps = getCapabilities(channelType || '');
  const isMetaWa = channelType === 'whatsapp_meta';
  const windowOpen = customerWindowOpen(lastCustomerMessageAt);
  const needsTemplate = isMetaWa && !windowOpen;
  const canComposer = Boolean(onSend);
  const quoting = canComposer && !needsTemplate;

  function pickQuote(msg: Message) {
    if (!quoting || !canQuote(msg) || !msg.id) return;
    setQuote({ id: msg.id, text: quotePreview(msg) });
  }

  async function sendText(text: string) {
    if (!onSend) return;
    await onSend(text, quote?.id);
    setQuote(null);
  }

  async function sendMedia(file: File, caption: string, asVoice?: boolean) {
    if (!onSendMedia) return;
    await onSendMedia(file, caption, asVoice, quote?.id);
    setQuote(null);
  }

  async function sendVoice(blob: Blob) {
    if (!onSendVoice) return;
    await onSendVoice(blob, quote?.id);
    setQuote(null);
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0">
      {onTogglePause && (
        <div className="px-3 py-2 border-b border-[var(--edge)] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            {isPaused ? (
              <span className="text-amber-500 text-xs flex items-center gap-1">
                <PauseIcon />
                AI מושהה
              </span>
            ) : (
              <span className="text-emerald-500 text-xs flex items-center gap-1">
                <PlayIcon />
                AI פעיל
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
          {onAddToReplyList && !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--edge)] text-[var(--ink)]"
            >
              הוסף לרשימה
            </button>
          )}
          <button
            type="button"
            onClick={onTogglePause}
            className={`
              px-3 py-1.5 rounded-full text-xs font-medium
              transition-colors duration-200 flex items-center gap-1.5 border
              ${isPaused
                ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-500 border-amber-500/30'
              }
            `}
          >
            {isPaused ? <PlayIcon /> : <PauseIcon />}
            {isPaused ? 'הפעל AI' : 'השהה AI'}
          </button>
          </div>
        </div>
      )}

      {adding && onAddToReplyList && (
        <form
          className="flex flex-wrap items-start gap-2 border-b border-[var(--edge)] px-3 py-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setListBusy(true);
            setListError('');
            try {
              await onAddToReplyList(listName, listNote);
              setAdding(false);
            } catch (err) {
              setListError(err instanceof Error ? err.message : 'שגיאה');
            } finally {
              setListBusy(false);
            }
          }}
        >
          <input
            className="w-36 rounded-lg border border-[var(--edge)] bg-transparent px-2 py-1 text-sm"
            maxLength={80}
            value={listName}
            onChange={(event) => setListName(event.target.value)}
            placeholder="שם"
          />
          <input
            className="min-w-[12rem] flex-1 rounded-lg border border-[var(--edge)] bg-transparent px-2 py-1 text-sm"
            maxLength={2000}
            value={listNote}
            onChange={(event) => setListNote(event.target.value)}
            placeholder="הנחיה"
          />
          <button type="submit" disabled={listBusy} className="text-xs text-[var(--acc)]">שמור</button>
          <button type="button" className="text-xs text-[var(--text-muted)]" onClick={() => setAdding(false)}>ביטול</button>
          {listError && <p className="w-full text-xs text-rose-400">{listError}</p>}
        </form>
      )}

      {isPaused && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-500 text-xs text-center">
          הודעות נשמרות אך ה-AI לא מגיב. לחץ &quot;הפעל AI&quot; כדי לחדש.
        </div>
      )}

      {agentId && conversationId ? (
        <SilenceBar agentId={agentId} conversationId={conversationId} refreshKey={messages.length} />
      ) : null}

      {needsTemplate && (
        <div className="px-4 py-2 bg-[oklch(0.80_0.125_225_/_0.12)] border-b border-[var(--edge)] text-[var(--ink)] text-xs text-center">
          חלון 24 שעות סגור. אפשר לשלוח רק תבנית מאושרת.
        </div>
      )}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 md:p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-[var(--text-secondary)]">אין הודעות בשיחה זו</div>
          </div>
        ) : (
          messages.map((msg, i) => {
            const msgDate = parseUTCDate(msg.created_at);
            const prevDate = i > 0 ? parseUTCDate(messages[i - 1].created_at) : null;
            const showDate = Boolean(msgDate && (!prevDate || msgDate.toDateString() !== prevDate.toDateString()));
            return (
              <ChatBubble
                key={msg.id ?? `row-${i}`}
                msg={msg}
                showDate={showDate}
                onQuote={quoting ? pickQuote : undefined}
                onSenderClick={onSenderClick}
              />
            );
          })
        )}
      </div>

      {canComposer && onSend && onSendMedia && onSendVoice && onSendTemplate && (
        <Composer
          mode={needsTemplate ? 'template' : 'freeform'}
          templates={templates}
          allowVoice={!needsTemplate && caps.voice}
          allowImages={!needsTemplate && caps.images}
          allowFiles={!needsTemplate && caps.files}
          quoteText={quote?.text ?? null}
          onCancelQuote={() => setQuote(null)}
          onSendText={sendText}
          onSendMedia={sendMedia}
          onSendVoice={sendVoice}
          onSendTemplate={onSendTemplate}
        />
      )}
    </div>
  );
}
