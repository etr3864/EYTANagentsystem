'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { Conversation } from '@/lib/types';
import type { WasenderContact } from '@/lib/api';
import { CHANNEL_DISPLAY_NAMES } from '@/lib/channels';
import { ChannelIcon, PlusIcon } from '@/components/ui/Icons';
import { phoneKey } from '@/lib/phone';

interface ContactListProps {
  conversations: Conversation[];
  book?: WasenderContact[];
  groups?: WasenderContact[];
  selectedId: number | null;
  selectedGroupJid?: string | null;
  onSelect: (id: number) => void;
  onOpenContact?: (phone: string, name: string) => void;
  onOpenGroup?: (jid: string, name: string) => void;
  onDelete: (id: number) => void;
  onNewChat?: () => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}

function getGenderIcon(gender: string | null): string {
  if (gender === 'male') return '👨';
  if (gender === 'female') return '👩';
  return '👤';
}

function Face({
  pic, gender, on, group,
}: { pic?: string | null; gender?: string | null; on?: boolean; group?: boolean }) {
  return (
    <>
      {pic ? (
        <img
          src={pic}
          alt=""
          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
          onError={(e) => {
            const el = e.target as HTMLImageElement;
            el.style.display = 'none';
            el.nextElementSibling?.classList.remove('hidden');
          }}
        />
      ) : null}
      <div className={`
        w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0
        ${pic ? 'hidden' : ''}
        ${on ? 'bg-[oklch(0.80_0.125_225_/_0.18)]' : 'bg-[var(--glass-2)]'}
      `}>
        {group ? '👥' : getGenderIcon(gender ?? null)}
      </div>
    </>
  );
}

function ChannelBadge({ channelType }: { channelType: string | null | undefined }) {
  if (!channelType) return null;
  const name = CHANNEL_DISPLAY_NAMES[channelType as keyof typeof CHANNEL_DISPLAY_NAMES] ?? channelType;
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-[var(--glass-2)] border border-[var(--edge)]" title={name}>
      <ChannelIcon channelType={channelType} size={14} />
    </span>
  );
}

export function ContactList({
  conversations,
  book = [],
  groups = [],
  selectedId,
  selectedGroupJid,
  onSelect,
  onOpenContact,
  onOpenGroup,
  onDelete,
  onNewChat,
  onLoadMore,
  hasMore,
  loadingMore,
}: ContactListProps) {
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const sentinelRef = useRef<HTMLDivElement>(null);

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting && hasMore && !loadingMore && onLoadMore) {
        onLoadMore();
      }
    },
    [hasMore, loadingMore, onLoadMore],
  );

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersection, { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersection]);

  const channelTypes = useMemo(() => {
    const types = new Set<string>();
    conversations.forEach(c => { if (c.channel_type) types.add(c.channel_type); });
    return Array.from(types);
  }, [conversations]);

  const showChannelBadges = channelTypes.length > 1;

  const knownPhones = useMemo(
    () => new Set(conversations.map((c) => phoneKey(c.user_phone))),
    [conversations],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter(c => {
      const matchSearch = !q || c.user_name?.toLowerCase().includes(q) || c.user_phone?.includes(q);
      const matchChannel = channelFilter === 'all' || c.channel_type === channelFilter || (!c.channel_type && channelFilter === 'legacy');
      return matchSearch && matchChannel;
    });
  }, [conversations, search, channelFilter]);

  const bookRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return book.filter((row) => {
      const phone = row.phone || row.jid;
      if (knownPhones.has(phoneKey(phone))) return false;
      if (channelFilter !== 'all' && channelFilter !== 'whatsapp_wasender') return false;
      if (!q) return true;
      return (row.name || '').toLowerCase().includes(q) || phone.includes(q);
    });
  }, [book, knownPhones, search, channelFilter]);

  const knownGroupJids = useMemo(
    () => new Set(conversations.filter((c) => c.user_phone?.endsWith('@g.us')).map((c) => c.user_phone)),
    [conversations],
  );

  const groupRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (channelFilter !== 'all' && channelFilter !== 'whatsapp_wasender') return [];
    return groups.filter((row) => {
      if (knownGroupJids.has(row.jid)) return false;
      if (!q) return true;
      return (row.name || '').toLowerCase().includes(q) || row.jid.toLowerCase().includes(q);
    });
  }, [groups, search, channelFilter, knownGroupJids]);

  return (
    <div className="h-full border-l border-[var(--edge)] flex flex-col min-w-0 overflow-hidden">
      <div className="p-3 md:p-4 border-b border-[var(--edge)]">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium text-[var(--ink)]">שיחות</div>
          {onNewChat && (
            <button
              type="button"
              onClick={onNewChat}
              title="צ׳אט חדש"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--ink)] text-[var(--bg)]"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              חדש
            </button>
          )}
        </div>
        <div className="text-xs text-[var(--text-secondary)]">
          {search || channelFilter !== 'all'
            ? `${filtered.length + bookRows.length + groupRows.length} מתוך ${conversations.length + book.length + groups.length}`
            : `${conversations.length} שיחות${bookRows.length ? ` · ${bookRows.length} אנשי קשר` : ''}${groupRows.length ? ` · ${groupRows.length} קבוצות` : ''}`}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-[var(--edge)] space-y-2">
        <div className="relative">
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם או מספר..."
            dir="rtl"
            className="w-full pr-8 pl-8 py-2 text-sm bg-[var(--glass-2)] border border-[var(--edge-strong)] rounded-2xl text-[var(--ink)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--acc)]"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {channelTypes.length > 1 && (
          <div className="flex gap-1.5">
            <button
              onClick={() => setChannelFilter('all')}
              title="כל הערוצים"
              className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-all ${channelFilter === 'all' ? 'bg-[var(--ink)] text-[var(--bg)]' : 'bg-[var(--glass-2)] text-[var(--text-secondary)] border border-[var(--edge)]'}`}
            >
              הכל
            </button>
            {channelTypes.map(ct => {
              const name = CHANNEL_DISPLAY_NAMES[ct as keyof typeof CHANNEL_DISPLAY_NAMES] ?? ct;
              return (
                <button
                  key={ct}
                  onClick={() => setChannelFilter(ct === channelFilter ? 'all' : ct)}
                  title={name}
                  className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-all flex items-center justify-center ${channelFilter === ct ? 'bg-[var(--ink)] text-[var(--bg)]' : 'bg-[var(--glass-2)] text-[var(--text-secondary)] border border-[var(--edge)]'}`}
                >
                  <ChannelIcon channelType={ct} size={18} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="overflow-y-auto flex-1 min-h-0 overscroll-contain">
        {filtered.length === 0 && bookRows.length === 0 && groupRows.length === 0 && (
          <div className="p-6 text-center text-sm text-[var(--text-secondary)]">
            {conversations.length === 0 && book.length === 0 && groups.length === 0 ? 'אין שיחות עדיין. אפשר לפתוח צ׳אט חדש.' : 'לא נמצאו תוצאות'}
          </div>
        )}
        {filtered.map(conv => (
          <div
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`ops-row ${selectedId === conv.id ? 'is-on' : ''}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Face
                  pic={conv.channel_profile_pic}
                  gender={conv.user_gender}
                  on={selectedId === conv.id}
                  group={conv.user_phone?.endsWith('@g.us')}
                />
                <div>
                  <div className="font-medium text-[var(--ink)] text-sm flex items-center gap-1.5 min-w-0">
                    {conv.channel_username && conv.channel_type === 'instagram' ? (
                      <a
                        href={`https://instagram.com/${conv.channel_username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-pink-400 transition-colors"
                        title={`@${conv.channel_username}`}
                      >
                        @{conv.channel_username}
                      </a>
                    ) : conv.channel_username && conv.channel_type === 'messenger' ? (
                      <a
                        href={`https://facebook.com/${conv.user_phone}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-[var(--acc)] transition-colors"
                        title={conv.channel_username}
                      >
                        {conv.channel_username}
                      </a>
                    ) : conv.user_phone?.endsWith('@g.us') ? (
                      conv.user_name || 'קבוצה'
                    ) : (
                      conv.user_name || `לקוח ${conv.user_phone.slice(-4)}`
                    )}
                    {showChannelBadges && <ChannelBadge channelType={conv.channel_type} />}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] font-mono">
                    {conv.user_phone?.endsWith('@g.us') ? 'קבוצה' : conv.user_phone}
                  </div>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conv.id);
                }}
                className="
                  p-1.5 rounded-lg
                  text-[var(--text-muted)] hover:text-red-400 
                  hover:bg-red-500/10
                  transition-colors
                "
                title="מחק שיחה"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}

        {groupRows.map((row) => (
          <div
            key={row.jid}
            onClick={() => onOpenGroup?.(row.jid, row.name)}
            className={`ops-row ${selectedGroupJid === row.jid ? 'is-on' : ''}`}
          >
            <div className="flex items-center gap-3">
              <Face pic={row.img_url} group />
              <div>
                <div className="font-medium text-[var(--ink)] text-sm">{row.name || row.jid}</div>
                <div className="text-xs text-[var(--text-muted)]">קבוצה</div>
              </div>
            </div>
          </div>
        ))}
        {bookRows.map((row) => {
          const phone = row.phone || row.jid.split('@')[0];
          return (
            <div
              key={row.jid}
              onClick={() => onOpenContact?.(phone, row.name)}
              className="ops-row"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Face pic={row.img_url} />
                  <div>
                    <div className="font-medium text-[var(--ink)] text-sm">
                      {row.name || `לקוח ${phone.slice(-4)}`}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] font-mono">
                      {phone}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Sentinel for infinite scroll */}
        <div ref={sentinelRef} className="h-1" />
        {loadingMore && (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-[var(--acc)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
