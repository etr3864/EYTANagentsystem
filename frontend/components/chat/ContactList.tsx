'use client';

import { useState, useMemo } from 'react';
import type { Conversation } from '@/lib/types';

interface ContactListProps {
  conversations: Conversation[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
}

function getGenderIcon(gender: string | null): string {
  if (gender === 'male') return '👨';
  if (gender === 'female') return '👩';
  return '👤';
}

export function ContactList({ conversations, selectedId, onSelect, onDelete }: ContactListProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(c =>
      c.user_name?.toLowerCase().includes(q) || c.user_phone?.includes(q)
    );
  }, [conversations, search]);

  return (
    <div className="h-full border-l border-slate-700 flex flex-col bg-slate-800/30">
      <div className="p-4 border-b border-slate-700">
        <div className="text-sm font-medium text-white">שיחות</div>
        <div className="text-xs text-slate-400">
          {search ? `${filtered.length} מתוך ${conversations.length}` : `${conversations.length} פעילות`}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-slate-700/50">
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
                <div className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-lg
                  ${selectedId === conv.id ? 'bg-blue-500/20' : 'bg-slate-700/50'}
                `}>
                  {getGenderIcon(conv.user_gender)}
                </div>
                <div>
                  <div className="font-medium text-white text-sm">
                    {conv.user_name || `לקוח ${conv.user_phone.slice(-4)}`}
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
      </div>
    </div>
  );
}
