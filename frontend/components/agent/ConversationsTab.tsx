'use client';

import { Card } from '@/components/ui';
import { ContactList } from '@/components/chat/ContactList';
import { ChatView } from '@/components/chat/ChatView';
import type { Conversation, Message } from '@/lib/types';

interface ConversationsTabProps {
  conversations: Conversation[];
  selectedId: number | null;
  messages: Message[];
  onSelectConversation: (id: number) => void;
  onDeleteConversation: (id: number) => void;
  onDeselectConversation?: () => void;
  onSendMessage?: (text: string) => Promise<void>;
  onTogglePause?: () => Promise<void>;
}

export function ConversationsTab({
  conversations, selectedId, messages,
  onSelectConversation, onDeleteConversation, onDeselectConversation,
  onSendMessage, onTogglePause
}: ConversationsTabProps) {
  const selectedConv = conversations.find(c => c.id === selectedId);
  if (conversations.length === 0) {
    return (
      <Card className="h-[70vh] flex items-center justify-center">
        <div className="text-center">
          <div className="text-5xl mb-4">💬</div>
          <div className="text-lg font-medium text-white mb-2">אין שיחות עדיין</div>
          <div className="text-sm text-slate-400">
            כשלקוחות ישלחו הודעות, הן יופיעו כאן
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card padding="none" className="h-[85vh] md:h-[70vh] overflow-hidden">
      <div className="flex h-full">
        {/* Contact list: full width on mobile, fixed w-80 on desktop. Hidden on mobile when chat is open */}
        <div className={`w-full md:w-80 md:block shrink-0 ${selectedId ? 'hidden' : 'block'}`}>
          <ContactList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={onSelectConversation}
            onDelete={onDeleteConversation}
          />
        </div>

        {/* Chat: full width on mobile, flex-1 on desktop. Hidden on mobile when no chat selected */}
        <div className={`flex-1 flex flex-col min-h-0 border-r border-slate-700 ${selectedId ? 'flex' : 'hidden md:flex'}`}>
          {selectedId ? (
            <>
              {/* Mobile back button */}
              {onDeselectConversation && (
                <button
                  onClick={onDeselectConversation}
                  className="md:hidden flex items-center gap-2 px-4 py-2.5 border-b border-slate-700 text-sm text-slate-300 hover:bg-slate-700/30"
                >
                  <span>→</span>
                  {selectedConv?.channel_profile_pic && (
                    <img src={selectedConv.channel_profile_pic} alt="" className="w-6 h-6 rounded-full" />
                  )}
                  <span className="font-medium">
                    {selectedConv?.channel_username
                      ? `@${selectedConv.channel_username}`
                      : selectedConv?.user_name || 'חזרה לשיחות'}
                  </span>
                </button>
              )}
              {/* Desktop chat header with user info */}
              <div className="hidden md:flex items-center gap-3 px-4 py-2 border-b border-slate-700 bg-slate-800/30">
                {selectedConv?.channel_profile_pic && (
                  <img src={selectedConv.channel_profile_pic} alt="" className="w-8 h-8 rounded-full object-cover" />
                )}
                <div className="text-sm font-medium text-white">
                  {selectedConv?.channel_username && selectedConv?.channel_type === 'instagram' ? (
                    <a
                      href={`https://instagram.com/${selectedConv.channel_username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-pink-400 transition-colors"
                    >
                      @{selectedConv.channel_username}
                    </a>
                  ) : selectedConv?.channel_username && selectedConv?.channel_type === 'messenger' ? (
                    <a
                      href={`https://facebook.com/${selectedConv.user_phone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-indigo-400 transition-colors"
                    >
                      {selectedConv.channel_username}
                    </a>
                  ) : (
                    selectedConv?.user_name || `לקוח ${selectedConv?.user_phone?.slice(-4) ?? ''}`
                  )}
                </div>
              </div>
              <ChatView 
                messages={messages}
                conversationId={selectedId}
                isPaused={selectedConv?.is_paused}
                onSend={onSendMessage} 
                onTogglePause={onTogglePause}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-slate-800/30">
              <div className="text-center">
                <div className="text-4xl mb-3">👈</div>
                <div className="text-slate-400">בחר שיחה מהרשימה</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
