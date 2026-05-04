'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { Conversation } from '@/lib/types';
import { CHANNEL_DISPLAY_NAMES } from '@/lib/channels';
import { ChannelIcon } from '@/components/ui/Icons';

interface ContactListProps {
  conversations: Conversation[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}

function getGenderIcon(gender: string | null): string {
  if (gender === 'male') return '👨';
  if (gender === 'female') return '👩';
  return '👤';
}

function ChannelBadge({ channelType }: { channelType: string | null | undefined }) {
  if (!channelType) return null;
  const name = CHANNEL_DISPLAY_NAMES[channelType as keyof typeof CHANNEL_DISPLAY_NAMES] ?? channelType;
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-700/50" title={name}>
      <ChannelIcon channelType={channelType} size={14} />
    </span>
  );
}

export function ContactList({ conversations, selectedId, onSelect, onDelete, onLoadMore, hasMore, loadingMore }: ContactListProps) {
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter(c => {
      const matchSearch = !q || c.user_name?.toLowerCase().includes(q) || c.user_phone?.includes(q);
      const matchChannel = channelFilter === 'all' || c.channel_type === channelFilter || (!c.channel_type && channelFilter === 'legacy');
      return matchSearch && matchChannel;
    });
  }, [conversations, search, channelFilter]);

  return (
    <div className="h-full border-l border-slate-700 flex flex-col bg-slate-800/30">
      <div className="p-4 border-b border-slate-700">
        <div className="text-sm font-medium text-white">שיחות</div>
        <div className="text-xs text-slate-400">
          {search || channelFilter !== 'all'
            ? `${filtered.length} מתוך ${conversations.length}`
            : `${conversations.length} פעילות`}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-slate-700/50 space-y-2">
        <div className="relative">
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם או מספר..."
            dir="rtl"
            className="w-full pr-8 pl-8 py-1.5 text-sm bg-slate-700/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
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
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${channelFilter === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/80'}`}
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
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center ${channelFilter === ct ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/80'}`}
                >
                  <ChannelIcon channelType={ct} size={18} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="overflow-y-auto flex-1">
        {filtered.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-400">לא נמצאו תוצאות</div>
        )}
        {filtered.map(conv => (
          <div
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`
              p-4 cursor-pointer
              border-b border-slate-700/50
              transition-colors duration-150
              ${selectedId === conv.id 
                ? 'bg-blue-500/10 border-r-2 border-r-blue-500' 
                : 'hover:bg-slate-700/30'
              }
            `}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {conv.channel_profile_pic ? (
                  <img
                    src={conv.channel_profile_pic}
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
                  ${conv.channel_profile_pic ? 'hidden' : ''}
                  ${selectedId === conv.id ? 'bg-blue-500/20' : 'bg-slate-700/50'}
                `}>
                  {getGenderIcon(conv.user_gender)}
                </div>
                <div>
                  <div className="font-medium text-white text-sm flex items-center gap-1.5">
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
                        className="hover:text-indigo-400 transition-colors"
                        title={conv.channel_username}
                      >
                        {conv.channel_username}
                      </a>
                    ) : (
                      conv.user_name || `לקוח ${conv.user_phone.slice(-4)}`
                    )}
                    {showChannelBadges && <ChannelBadge channelType={conv.channel_type} />}
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    {conv.user_phone}
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
                  text-slate-500 hover:text-red-400 
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

        {/* Sentinel for infinite scroll */}
        <div ref={sentinelRef} className="h-1" />
        {loadingMore && (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
