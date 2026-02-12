'use client';

import { useEffect, useRef, useState } from 'react';
import type { Message } from '@/lib/types';
import { VoiceIcon, ImageIcon, VideoIcon, SendIcon, PauseIcon, PlayIcon } from '@/components/ui/Icons';

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
        const msgDate = msg.created_at ? new Date(msg.created_at) : null;
        const prevDate = i > 0 && messages[i-1].created_at ? new Date(messages[i-1].created_at!) : null;
        const showDate = msgDate && (!prevDate || msgDate.toDateString() !== prevDate.toDateString());
        
        const isUser = msg.role === 'user';
        const isVoice = msg.message_type === 'voice';
        const isImage = msg.message_type === 'image';
        const isVideo = msg.message_type === 'video';
        const isManual = msg.message_type === 'manual';
        const hasMediaUrl = !!msg.media_url;
        
        // Clean content for voice messages (remove prefix)
        let displayContent = msg.content;
        if (isVoice) {
          displayContent = msg.content.replace(/^\[הודעה קולית\]:\s*/, '');
        } else if (isImage && !hasMediaUrl) {
          // User sent image - show description
          displayContent = msg.content === '[תמונה]' ? '' : msg.content.replace(/^\[תמונה\]:\s*/, '');
        } else if ((isImage || isVideo) && hasMediaUrl) {
          // Agent sent media - show caption or clean content
          displayContent = msg.content.replace(/^\[(image|video)\]:\s*/i, '');
        }
        
        // Determine bubble style
        const getBubbleStyle = () => {
          if (!isUser) {
            if (hasMediaUrl) return 'bg-indigo-600/20 text-indigo-50 rounded-tl-sm border border-indigo-500/30';
            return 'bg-slate-700/50 text-slate-100 rounded-tl-sm';
          }
          if (isVoice) return 'bg-purple-600/20 text-purple-50 rounded-tr-sm border border-purple-500/30';
          if (isImage) return 'bg-cyan-600/20 text-cyan-50 rounded-tr-sm border border-cyan-500/30';
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
            <div className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${getBubbleStyle()}`}>
                {/* Voice indicator */}
                {isVoice && (
                  <div className="flex items-center gap-2 text-purple-400 text-xs mb-2 pb-2 border-b border-purple-500/20">
                    <VoiceIcon />
                    <span>הודעה קולית</span>
                  </div>
                )}
                
                {/* Image indicator (user sent image without URL) */}
                {isImage && !hasMediaUrl && (
                  <div className="flex items-center gap-2 text-cyan-400 text-xs mb-2 pb-2 border-b border-cyan-500/20">
                    <ImageIcon />
                    <span>תמונה</span>
                  </div>
                )}
                
                {/* Media display (agent sent media with URL) */}
                {hasMediaUrl && (
                  <div className="mb-2">
                    {/* Media type indicator */}
                    <div className={`flex items-center gap-2 text-xs mb-2 pb-2 border-b ${
                      isVideo ? 'text-pink-400 border-pink-500/20' : 'text-indigo-400 border-indigo-500/20'
                    }`}>
                      {isVideo ? <VideoIcon /> : <ImageIcon />}
                      <span>{isVideo ? 'סרטון' : 'תמונה'}</span>
                    </div>
                    
                    {/* Actual media */}
                    {isImage && (
                      <img 
                        src={msg.media_url!} 
                        alt={displayContent || 'תמונה'}
                        className="max-w-full max-h-64 rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => window.open(msg.media_url!, '_blank')}
                      />
                    )}
                    {isVideo && (
                      <video 
                        src={msg.media_url!}
                        controls
                        className="max-w-full max-h-64 rounded-lg"
                        preload="metadata"
                      />
                    )}
                  </div>
                )}
                
                {displayContent && (
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    {displayContent}
                  </div>
                )}
                
                {msgDate && (
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
                    {!isUser && (
                      <>
                        <span className="mr-1">✓✓</span>
                        {isManual && (
                          <span className="text-amber-400/60 text-[9px]">• ידני</span>
                        )}
                      </>
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
