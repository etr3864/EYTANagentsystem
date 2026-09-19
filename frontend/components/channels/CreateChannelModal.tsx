'use client';

import { useMemo, useState } from 'react';
import { Button, Input, Modal, Select } from '@/components/ui';
import { createWasenderLine, type Agent, type WasenderLine } from '@/lib/api';
import { toSessionPhone } from '@/lib/phone';

interface Props {
  agents: Agent[];
  takenAgentIds: Set<number>;
  onClose: () => void;
  onCreated: (line: WasenderLine) => void;
}

export function CreateChannelModal({ agents, takenAgentIds, onClose, onCreated }: Props) {
  const options = useMemo(
    () =>
      [...agents]
        .sort((a, b) => a.name.localeCompare(b.name, 'he'))
        .map((agent) => ({
          value: String(agent.id),
          label: takenAgentIds.has(agent.id) ? `${agent.name} · יש ערוץ, יוחלף` : agent.name,
        })),
    [agents, takenAgentIds],
  );
  const [agentId, setAgentId] = useState(options[0]?.value || '');
  const [phone, setPhone] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const replacing = takenAgentIds.has(Number(agentId));
  const normalized = toSessionPhone(phone);

  async function handleCreate() {
    const id = Number(agentId);
    if (!id || !normalized) {
      setError('הספק דורש מספר. אפשר 054 או +972…');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const line = await createWasenderLine(id, {
        phone: normalized,
        session_name: sessionName.trim() || undefined,
        note: note.trim() || undefined,
      });
      onCreated(line);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'יצירה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="ערוץ חדש" onClose={onClose}>
      {options.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)]">אין סוכנים. צור סוכן קודם.</p>
      ) : (
        <div className="space-y-3">
          <Select
            label="סוכן"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            options={options}
          />
          <Input
            label="מספר WhatsApp"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="054… או +972…"
            dir="ltr"
            hint={normalized ? `יישלח ${normalized}` : 'הספק דורש מספר בינלאומי'}
          />
          <Input
            label="שם סשן"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder="כפי שיופיע אצל הספק"
            hint="אופציונלי. בלי זה יישלח שם הסוכן."
          />
          <Input
            label="הערה"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="רק אצלנו"
            hint="לא נשלח לספק."
          />
          {replacing && (
            <p className="text-xs text-amber-300">לסוכן הזה כבר יש ערוץ. הסשן הישן אצל הספק יימחק ויוחלף.</p>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="button" onClick={handleCreate} loading={busy} disabled={!agentId || !normalized}>
            {replacing ? 'החלף סשן' : 'צור ערוץ'}
          </Button>
        </div>
      )}
    </Modal>
  );
}
