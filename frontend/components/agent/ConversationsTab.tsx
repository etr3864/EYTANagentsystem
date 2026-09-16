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
    <Card padding="none" className="h-full ops-shell try-glass !rounded-[22px] md:!rounded-[28px]">
      <div className="flex h-full min-w-0 overflow-hidden">
        <div className={`w-full md:w-96 md:block shrink-0 min-w-0 ${selectedId ? 'hidden' : 'block'}`}>
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

        <div className={`flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden border-r border-[var(--edge)] ${selectedId ? 'flex' : 'hidden md:flex'}`}>
          {selectedId ? (
            <>
              {onDeselectConversation && (
                <button
                  type="button"
                  onClick={onDeselectConversation}
                  className="md:hidden flex items-center gap-2 px-3 py-2.5 border-b border-[var(--edge)] text-sm text-[var(--ink)] shrink-0"
                >
                  <span>→</span>
                  {selectedConv?.channel_profile_pic && (
                    <img src={selectedConv.channel_profile_pic} alt="" className="w-6 h-6 rounded-full" />
                  )}
                  <span className="font-medium truncate">
                    {selectedConv?.channel_username
                      ? `@${selectedConv.channel_username}`
                      : selectedConv?.user_name || 'חזרה לשיחות'}
                  </span>
                </button>
              )}
              <div className="hidden md:flex items-center gap-3 px-4 py-2.5 border-b border-[var(--edge)] shrink-0">
                {selectedConv?.channel_profile_pic && (
                  <img src={selectedConv.channel_profile_pic} alt="" className="w-8 h-8 rounded-full object-cover" />
                )}
                <div className="text-sm font-medium text-[var(--ink)] truncate">
                  {selectedConv?.channel_username && selectedConv?.channel_type === 'instagram' ? (
                    <a
                      href={`https://instagram.com/${selectedConv.channel_username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[var(--acc)] transition-colors"
                    >
                      @{selectedConv.channel_username}
                    </a>
                  ) : selectedConv?.channel_username && selectedConv?.channel_type === 'messenger' ? (
                    <a
                      href={`https://facebook.com/${selectedConv.user_phone}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[var(--acc)] transition-colors"
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
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-[var(--text-secondary)] px-6">
                בחר שיחה מהרשימה או פתח צ׳אט חדש
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
