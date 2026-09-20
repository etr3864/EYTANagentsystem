'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import { ContactList } from '@/components/chat/ContactList';
import { ChatView } from '@/components/chat/ChatView';
import { DirectoryCard } from '@/components/chat/DirectoryCard';
import { AvatarLightbox } from '@/components/chat/AvatarLightbox';
import type { Conversation, Message, WhatsAppTemplate } from '@/lib/types';
import { getWasenderGroups, type WasenderContact } from '@/lib/api';
import type { TemplateSendPayload } from '@/components/chat/Composer';

interface ConversationsTabProps {
  agentId: number;
  conversations: Conversation[];
  book?: WasenderContact[];
  selectedId: number | null;
  messages: Message[];
  templates?: WhatsAppTemplate[];
  onSelectConversation: (id: number) => void;
  onOpenContact?: (phone: string, name: string) => void;
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
  agentId,
  conversations, book, selectedId, messages, templates = [],
  onSelectConversation, onOpenContact, onDeleteConversation, onDeselectConversation,
  onNewChat, onSendMessage, onSendMedia, onSendVoice, onSendTemplate, onTogglePause,
  onLoadMore, hasMore, loadingMore,
}: ConversationsTabProps) {
  const [groups, setGroups] = useState<WasenderContact[]>([]);
  const [cardStack, setCardStack] = useState<string[]>([]);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const cardJid = cardStack[cardStack.length - 1] ?? null;
  const selectedConv = conversations.find(c => c.id === selectedId);
  const isGroup = Boolean(selectedConv?.user_phone?.endsWith('@g.us'));
  const showPane = Boolean(selectedId || cardJid);
  const canCard = !selectedConv?.channel_type || selectedConv.channel_type === 'whatsapp_wasender';
  const title = selectedConv?.channel_username
    ? `@${selectedConv.channel_username}`
    : isGroup
      ? (selectedConv?.user_name || 'קבוצה')
      : selectedConv?.user_name || (selectedConv ? `לקוח ${selectedConv.user_phone.slice(-4)}` : '');

  useEffect(() => {
    getWasenderGroups(agentId).then(setGroups).catch(() => setGroups([]));
  }, [agentId]);

  const openCard = (jid: string) => {
    const key = (jid || '').trim();
    if (!key) return;
    setCardStack((stack) => (stack[stack.length - 1] === key ? stack : [...stack, key]));
  };

  const openChat = (id: number) => {
    setCardStack([]);
    onSelectConversation(id);
  };

  const openGroup = (jid: string, name: string) => {
    setCardStack([]);
    onOpenContact?.(jid, name);
  };

  const openPerson = (phone: string, name: string) => {
    const key = (phone || '').trim();
    if (selectedConv && selectedConv.user_phone === key) {
      setCardStack([]);
      return;
    }
    setCardStack([]);
    onOpenContact?.(key, name);
  };

  return (
    <Card padding="none" className="h-full ops-shell try-glass !rounded-[22px] md:!rounded-[28px]">
      {zoomSrc ? <AvatarLightbox src={zoomSrc} alt={title} onClose={() => setZoomSrc(null)} /> : null}
      <div className="flex h-full min-w-0 overflow-hidden">
        <div className={`w-full md:w-96 md:block shrink-0 min-w-0 ${showPane ? 'hidden' : 'block'}`}>
          <ContactList
            conversations={conversations}
            book={book}
            groups={groups}
            selectedId={selectedId}
            selectedGroupJid={cardJid?.endsWith('@g.us') ? cardJid : null}
            onSelect={openChat}
            onOpenContact={openPerson}
            onOpenGroup={openGroup}
            onDelete={onDeleteConversation}
            onNewChat={onNewChat}
            onLoadMore={onLoadMore}
            hasMore={hasMore}
            loadingMore={loadingMore}
          />
        </div>

        <div className={`flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden border-r border-[var(--edge)] ${showPane ? 'flex' : 'hidden md:flex'}`}>
          {cardJid ? (
            <DirectoryCard
              agentId={agentId}
              jid={cardJid}
              onClose={() => setCardStack((stack) => stack.slice(0, -1))}
              onOpenCard={openCard}
              onOpenChat={openPerson}
            />
          ) : selectedId ? (
            <>
              <div className="flex items-center gap-3 border-b border-[var(--edge)] px-3 py-2.5 md:px-4 shrink-0">
                {onDeselectConversation ? (
                  <button
                    type="button"
                    onClick={onDeselectConversation}
                    className="md:hidden text-sm text-[var(--ink)]"
                  >
                    →
                  </button>
                ) : null}
                {selectedConv?.channel_profile_pic ? (
                  <button
                    type="button"
                    onClick={() => setZoomSrc(selectedConv.channel_profile_pic || null)}
                    className="shrink-0"
                  >
                    <img
                      src={selectedConv.channel_profile_pic}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  </button>
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--glass-2)] text-lg">
                    {isGroup ? '👥' : '👤'}
                  </div>
                )}
                <button
                  type="button"
                  disabled={!canCard}
                  onClick={() => canCard && selectedConv && openCard(selectedConv.user_phone)}
                  className="min-w-0 flex-1 text-right disabled:cursor-default"
                >
                  <span className="block truncate text-sm font-medium text-[var(--ink)]">{title}</span>
                  {canCard ? (
                    <span className="block text-[11px] text-[var(--text-muted)]">
                      {isGroup ? 'קבוצה · פרטים ומשתתפים' : 'פרטי איש קשר'}
                    </span>
                  ) : null}
                </button>
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
                onTogglePause={isGroup ? undefined : onTogglePause}
                onSenderClick={isGroup ? (phone) => openCard(phone) : undefined}
              />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="px-6 text-center text-[var(--text-secondary)]">
                בחר שיחה מהרשימה או פתח צ׳אט חדש
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
