'use client';

import { Input } from '@/components/ui/Input';

const MAX_PHONES = 3;

interface DestinationsProps {
  phones: string[];
  webhookUrl: string;
  onPhonesChange: (phones: string[]) => void;
  onWebhookChange: (url: string) => void;
}

export function Destinations({
  phones,
  webhookUrl,
  onPhonesChange,
  onWebhookChange,
}: DestinationsProps) {
  const slots = [...phones, ...Array(MAX_PHONES - phones.length).fill('')].slice(0, MAX_PHONES);

  const setPhone = (index: number, value: string) => {
    const next = [...slots];
    next[index] = value.replace(/\D/g, '');
    onPhonesChange(next.filter(Boolean));
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">לאן לשלוח — טלפון, webhook, או שניהם</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {slots.map((phone, index) => (
          <Input
            key={index}
            label={`טלפון צוות ${index + 1}`}
            value={phone}
            inputMode="numeric"
            placeholder="97250..."
            onChange={(e) => setPhone(index, e.target.value)}
          />
        ))}
      </div>
      <Input
        label="Webhook (אופציונלי, HTTPS)"
        value={webhookUrl}
        placeholder="https://..."
        onChange={(e) => onWebhookChange(e.target.value)}
      />
    </div>
  );
}
