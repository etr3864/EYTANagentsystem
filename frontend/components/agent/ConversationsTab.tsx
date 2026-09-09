'use client';

import { Card } from '@/components/ui';
import { ContactList } from '@/components/chat/ContactList';
import { ChatView } from '@/components/chat/ChatView';
import type { Conversation, Message, WhatsAppTemplate } from '@/lib/types';
import type { TemplateSendPayload } from '@/components/chat/Composer';

interface ConversationsTabProps {
  conversations: Conversation[];
  selectedId: number | null;
  messages: Message[];
  templates?: WhatsAppTemplate[];
  onSelectConversation: (id: number) => void;
  onDeleteConversation: (id: number) => void;
  onDeselectConversation?: () => void;
  onNewChat?: () => void;
  onSendMessage?: (text: string) => Promise<void>;
  onSendMedia?: (file: File, caption: string, asVoice?: boolean) => Promise<void>;
  onSendVoice?: (blob: Blob) => Promise<void>;
  onSendTemplate?: (payload: TemplateSendPayload) => Promise<void>;
  onTogglePause?: () => Promise<void>;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}

export function ConversationsTab({
  conversations, selectedId, messages, templates = [],
  onSelectConversation, onDeleteConversation, onDeselectConversation,
  onNewChat, onSendMessage, onSendMedia, onSendVoice, onSendTemplate, onTogglePause,
  onLoadMore, hasMore, loadingMore,
}: ConversationsTabProps) {
  const selectedConv = conversations.find(c => c.id === selectedId);

  return (
    <Card padding="none" className="h-full overflow-hidden">
      <div className="flex h-full">
        <div className={`w-full md:w-96 md:block shrink-0 ${selectedId ? 'hidden' : 'block'}`}>
          <ContactList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={onSelectConversation}
            onDelete={onDeleteConversation}
            onNewChat={onNewChat}
            onLoadMore={onLoadMore}
            hasMore={hasMore}
            loadingMore={loadingMore}
          />
        </div>

        <div className={`flex-1 flex flex-col min-h-0 border-r border-slate-700 ${selectedId ? 'flex' : 'hidden md:flex'}`}>
          {selectedId ? (
            <>
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
                channelType={selectedConv?.channel_type}
                lastCustomerMessageAt={selectedConv?.last_customer_message_at}
                templates={templates}
                onSend={onSendMessage}
                onSendMedia={onSendMedia}
                onSendVoice={onSendVoice}
                onSendTemplate={onSendTemplate}
                onTogglePause={onTogglePause}
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-slate-800/30">
              <div className="text-center">
                <div className="text-slate-400">בחר שיחה מהרשימה או פתח צ׳אט חדש</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
