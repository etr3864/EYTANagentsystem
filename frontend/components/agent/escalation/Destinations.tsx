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
    next[index] = value;
    onPhonesChange(next.map((item) => item.trim()).filter(Boolean));
  };

  return (
    <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div>
        <p className="text-sm font-medium text-white">לאן לשלוח</p>
        <p className="text-xs text-slate-500 mt-1">
          טלפון צוות, webhook, או שניהם. מספר בכל פורמט — 05, +972, או 972.
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
      <Input
        label="Webhook (אופציונלי, HTTPS)"
        value={webhookUrl}
        placeholder="https://..."
        onChange={(e) => onWebhookChange(e.target.value)}
      />
    </div>
  );
}
