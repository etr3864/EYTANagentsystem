'use client';

import { useEffect, useRef } from 'react';
import type { Message, WhatsAppTemplate } from '@/lib/types';
import { parseUTCDate } from '@/lib/dates';
import { PauseIcon, PlayIcon } from '@/components/ui/Icons';
import { EscalationNote } from './EscalationNote';
import { FunctionNote } from './FunctionNote';
import { MessageMedia, bubbleText } from './MessageMedia';
import { ReplyQuote } from './ReplyQuote';
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
  onSend?: (text: string) => Promise<void>;
  onSendMedia?: (file: File, caption: string, asVoice?: boolean) => Promise<void>;
  onSendVoice?: (blob: Blob) => Promise<void>;
  onSendTemplate?: (payload: TemplateSendPayload) => Promise<void>;
  onTogglePause?: () => Promise<void>;
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
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef<number>(0);
  const prevConversationId = useRef<number | null | undefined>(null);
  
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
      )}
      
      {isPaused && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-500 text-xs text-center">
          הודעות נשמרות אך ה-AI לא מגיב. לחץ &quot;הפעל AI&quot; כדי לחדש.
        </div>
      )}

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
        const prevDate = i > 0 ? parseUTCDate(messages[i-1].created_at) : null;
        const showDate = msgDate && (!prevDate || msgDate.toDateString() !== prevDate.toDateString());
        
        const isUser = msg.role === 'user';
        const isImage = msg.message_type === 'image';
        const isVideo = msg.message_type === 'video';
        const isManual = msg.message_type === 'manual';
        const isExternal = msg.message_type === 'external';
        const isTriggerData = msg.message_type === 'trigger_data';
        const isEscalation = msg.message_type === 'escalation';
        const isFunction = msg.message_type === 'function';
        const isCenteredNote = isTriggerData || isEscalation || isFunction;
        const hasMediaUrl = !!msg.media_url;
        const tooLarge = !!msg.media_too_large;
        
        const displayContent = bubbleText(msg);
        const captionUnderMedia = tooLarge || ((isImage || isVideo) && hasMediaUrl);
        
        const getBubbleStyle = () => {
          if (isEscalation) return 'ops-bubble ops-bubble-agent border-rose-500/40';
          if (isTriggerData) return 'ops-bubble ops-bubble-agent border-amber-500/40';
          if (isExternal) return 'ops-bubble ops-bubble-agent border-orange-500/40';
          if (isUser) return 'ops-bubble ops-bubble-user';
          return 'ops-bubble ops-bubble-agent';
        };
        
        return (
          <div key={msg.id ?? `row-${i}`}>
            {showDate && msgDate && (
              <div className="flex items-center justify-center my-6">
                <div className="bg-[var(--glass)] border border-[var(--edge)] text-[var(--text-muted)] text-[11px] tracking-[0.12em] px-3.5 py-1 rounded-full">
                  {msgDate.toLocaleDateString('he-IL', { 
                    weekday: 'long', 
                    day: 'numeric', 
                    month: 'long' 
                  })}
                </div>
              </div>
            )}
            
            <div className={`flex ${isCenteredNote ? 'justify-center' : isUser ? 'justify-start' : 'justify-end'}`}>
              <div className={isFunction
                ? 'w-fit max-w-[min(90%,28rem)]'
                : `${isCenteredNote ? 'max-w-[90%]' : ''} ${getBubbleStyle()}`
              }>
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
                {!isFunction && msg.reply_to_text && <ReplyQuote text={msg.reply_to_text} />}
                {!isFunction && <MessageMedia msg={msg} displayContent={displayContent} />}
                
                {displayContent && !isEscalation && !isFunction && !captionUnderMedia && (
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    {displayContent}
                  </div>
                )}
                
                {msgDate && !isFunction && (
                  <div className="text-[10px] mt-1.5 flex items-center gap-1 text-[var(--text-muted)]">
                    {msgDate.toLocaleTimeString('he-IL', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                    {!isUser && !isCenteredNote && (
                      <>
                        <span className="mr-1">✓✓</span>
                        {isManual && (
                          <span className="text-amber-400/60 text-[9px]">• ידני</span>
                        )}
                        {isExternal && (
                          <span className="text-orange-400/70 text-[9px]">• אוטומציה</span>
                        )}
                      </>
                    )}
                    {isTriggerData && (
                      <span className="text-amber-400/70 text-[9px]">רק לסוכן</span>
                    )}
                    {isEscalation && (
                      <span className="text-rose-400/70 text-[9px]">פנימי</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
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
          onSendText={onSend}
          onSendMedia={onSendMedia}
          onSendVoice={onSendVoice}
          onSendTemplate={onSendTemplate}
        />
      )}
    </div>
  );
}
