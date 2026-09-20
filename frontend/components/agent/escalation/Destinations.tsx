'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { getWasenderGroups, type WasenderContact } from '@/lib/api';
import type { EscalationGroup } from '@/lib/escalation';

const MAX_PHONES = 3;
const MAX_GROUPS = 3;

interface DestinationsProps {
  agentId: number;
  phones: string[];
  groups: EscalationGroup[];
  webhookUrl: string;
  onPhonesChange: (phones: string[]) => void;
  onGroupsChange: (groups: EscalationGroup[]) => void;
  onWebhookChange: (url: string) => void;
}

export function Destinations({
  agentId,
  phones,
  groups,
  webhookUrl,
  onPhonesChange,
  onGroupsChange,
  onWebhookChange,
}: DestinationsProps) {
  const slots = [...phones, ...Array(MAX_PHONES - phones.length).fill('')].slice(0, MAX_PHONES);
  const [available, setAvailable] = useState<WasenderContact[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    getWasenderGroups(agentId).then(setAvailable).catch(() => setAvailable([]));
  }, [agentId]);

  const setPhone = (index: number, value: string) => {
    const next = [...slots];
    next[index] = value;
    onPhonesChange(next.map((item) => item.trim()).filter(Boolean));
  };

  const toggleGroup = (item: WasenderContact) => {
    const selected = groups.some((row) => row.jid === item.jid);
    if (selected) {
      onGroupsChange(groups.filter((row) => row.jid !== item.jid));
      return;
    }
    if (groups.length >= MAX_GROUPS) return;
    onGroupsChange([...groups, { jid: item.jid, name: item.name }]);
  };

  return (
    <div className="space-y-3 rounded-lg border border-[var(--edge)] bg-[var(--glass)] p-3">
      <div>
        <p className="text-sm font-medium text-[var(--ink)]">לאן לשלוח</p>
        <p className="text-xs text-[var(--text-muted)] mt-1">
          עד 3 טלפונים ועד 3 קבוצות, וגם webhook. מספר בכל פורמט — 05, +972, או 972.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {slots.map((phone, index) => (
          <Input
            key={index}
            label={`טלפון צוות ${index + 1}`}
            value={phone}
            placeholder="050... או +972..."
            onChange={(e) => setPhone(index, e.target.value)}
          />
        ))}
      </div>
      <GroupPicker
        available={available}
        selected={groups}
        query={query}
        onQuery={setQuery}
        onToggle={toggleGroup}
      />
      <Input
        label="Webhook (אופציונלי, HTTPS)"
        value={webhookUrl}
        placeholder="https://..."
        onChange={(e) => onWebhookChange(e.target.value)}
      />
    </div>
  );
}

function GroupPicker({
  available,
  selected,
  query,
  onQuery,
  onToggle,
}: {
  available: WasenderContact[];
  selected: EscalationGroup[];
  query: string;
  onQuery: (value: string) => void;
  onToggle: (item: WasenderContact) => void;
}) {
  const visible = available.filter((item) => {
    const q = query.trim();
    if (!q) return true;
    return `${item.name} ${item.jid}`.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <div className="space-y-2">
      <p className="text-sm text-[var(--ink)]">קבוצות WhatsApp ({selected.length}/{MAX_GROUPS})</p>
      {available.length > 8 && (
        <Input value={query} placeholder="חיפוש קבוצה" onChange={(e) => onQuery(e.target.value)} />
      )}
      {available.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">אין קבוצות. חבר WhatsApp וודא שהמספר בקבוצות.</p>
      ) : (
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {visible.map((item) => {
            const checked = selected.some((row) => row.jid === item.jid);
            const full = !checked && selected.length >= MAX_GROUPS;
            return (
              <label
                key={item.jid}
                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                  full ? 'opacity-40' : 'cursor-pointer hover:bg-[var(--bg-tertiary)]'
                }`}
              >
                <input type="checkbox" checked={checked} disabled={full} onChange={() => onToggle(item)} />
                <span className="truncate">{item.name || item.jid}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
