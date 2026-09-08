'use client';

import { useEffect, useRef, useState } from 'react';
import type { Message } from '@/lib/types';
import { parseUTCDate } from '@/lib/dates';
import { SendIcon, PauseIcon, PlayIcon } from '@/components/ui/Icons';
import { EscalationNote } from './EscalationNote';
import { FunctionNote } from './FunctionNote';
import { MessageMedia, bubbleText } from './MessageMedia';
import { ReplyQuote } from './ReplyQuote';

interface ChatViewProps {
  messages: Message[];
  conversationId?: number | null;
  isPaused?: boolean;
  onSend?: (text: string) => Promise<void>;
  onTogglePause?: () => Promise<void>;
}

export function ChatView({ messages, conversationId, isPaused, onSend, onTogglePause }: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef<number>(0);
  const prevConversationId = useRef<number | null | undefined>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  
  // Scroll to bottom only on initial load, conversation change, or when NEW messages arrive
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
  
  async function handleSend() {
    if (!text.trim() || !onSend || sending) return;
    
    setSending(true);
    try {
      await onSend(text.trim());
      setText('');
    } catch (e) {
      console.error('Send failed:', e);
    } finally {
      setSending(false);
    }
  }
  
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0">
      {/* Header with pause toggle */}
      {onTogglePause && (
        <div className="px-4 py-2 border-b border-slate-700 bg-slate-800/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isPaused ? (
              <span className="text-amber-400 text-xs flex items-center gap-1">
                <PauseIcon />
                AI מושהה
              </span>
            ) : (
              <span className="text-emerald-400 text-xs flex items-center gap-1">
                <PlayIcon />
                AI פעיל
              </span>
            )}
          </div>
          <button
            onClick={onTogglePause}
            className={`
              px-3 py-1.5 rounded-lg text-xs font-medium
              transition-colors duration-200 flex items-center gap-1.5
              ${isPaused 
                ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30' 
                : 'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 border border-amber-500/30'
              }
            `}
          >
            {isPaused ? <PlayIcon /> : <PauseIcon />}
            {isPaused ? 'הפעל AI' : 'השהה AI'}
          </button>
        </div>
      )}
      
      {/* Paused banner */}
      {isPaused && (
        <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-300 text-xs text-center">
          הודעות נשמרות אך ה-AI לא מגיב. לחץ &quot;הפעל AI&quot; כדי לחדש.
        </div>
      )}
      
      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 bg-slate-900/30">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-slate-400">אין הודעות בשיחה זו</div>
          </div>
        ) : (
        messages.map((msg, i) => {
        const msgDate = parseUTCDate(msg.created_at);
        const prevDate = i > 0 ? parseUTCDate(messages[i-1].created_at) : null;
        const showDate = msgDate && (!prevDate || msgDate.toDateString() !== prevDate.toDateString());
        
        const isUser = msg.role === 'user';
        const isVoice = msg.message_type === 'voice';
        const isImage = msg.message_type === 'image';
        const isVideo = msg.message_type === 'video';
        const isDocument = msg.message_type === 'document';
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
        
        // Determine bubble style
        const getBubbleStyle = () => {
          if (!isUser) {
            if (isEscalation) return 'bg-rose-600/10 text-rose-50 rounded-tl-sm border border-rose-500/30';
            if (isTriggerData) return 'bg-amber-600/10 text-amber-50 rounded-tl-sm border border-amber-500/30';
            if (isExternal) return 'bg-orange-600/15 text-orange-50 rounded-tl-sm border border-orange-500/30';
            if (hasMediaUrl) return 'bg-indigo-600/20 text-indigo-50 rounded-tl-sm border border-indigo-500/30';
            return 'bg-slate-700/50 text-slate-100 rounded-tl-sm';
          }
          if (isVoice) return 'bg-purple-600/20 text-purple-50 rounded-tr-sm border border-purple-500/30';
          if (isImage || isVideo) return 'bg-cyan-600/20 text-cyan-50 rounded-tr-sm border border-cyan-500/30';
          if (isDocument || tooLarge) return 'bg-amber-600/20 text-amber-50 rounded-tr-sm border border-amber-500/30';
          return 'bg-emerald-600/20 text-emerald-50 rounded-tr-sm';
        };
        
        return (
          <div key={i}>
            {/* Date Separator */}
            {showDate && msgDate && (
              <div className="flex items-center justify-center my-6">
                <div className="bg-slate-700/50 text-slate-300 text-xs px-4 py-1.5 rounded-full">
                  {msgDate.toLocaleDateString('he-IL', { 
                    weekday: 'long', 
                    day: 'numeric', 
                    month: 'long' 
                  })}
                </div>
              </div>
            )}
            
            {/* Message Bubble */}
            <div className={`flex ${isCenteredNote ? 'justify-center' : isUser ? 'justify-start' : 'justify-end'}`}>
              <div className={isFunction
                ? 'w-fit max-w-[min(90%,28rem)]'
                : `${isCenteredNote ? 'max-w-[90%]' : 'max-w-[75%]'} px-4 py-2.5 rounded-2xl ${getBubbleStyle()}`
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
                  <div className={`
                    text-[10px] mt-1.5 flex items-center gap-1
                    ${isUser 
                      ? isVoice 
                        ? 'text-purple-400/70' 
                        : isImage 
                          ? 'text-cyan-400/70'
                          : 'text-emerald-400/70' 
                      : 'text-slate-500'
                    }
                  `}>
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
      
      {/* Input Area */}
      {onSend && (
        <div className="p-3 border-t border-slate-700 bg-slate-800/50">
          <div className="flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="כתוב הודעה..."
              disabled={sending}
              className="
                flex-1 px-4 py-2.5 rounded-xl
                bg-slate-700/50 border border-slate-600/50
                text-white placeholder-slate-400
                focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50
                disabled:opacity-50
              "
            />
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="
                px-4 py-2.5 rounded-xl
                bg-blue-600 hover:bg-blue-500 
                disabled:bg-slate-600 disabled:cursor-not-allowed
                transition-colors duration-200
                text-white font-medium
                flex items-center gap-2
              "
            >
              {sending ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <SendIcon />
              )}
              <span>שלח</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
