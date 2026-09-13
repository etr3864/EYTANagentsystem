'use client';

import { FormEvent, useState } from 'react';
import { AgentAvatar } from './AgentAvatar';

export function EntryForm({
  agentName,
  busy,
  error,
  onSubmit,
}: {
  agentName: string;
  busy: boolean;
  error: string | null;
  onSubmit: (name: string, phone: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  async function handle(e: FormEvent) {
    e.preventDefault();
    await onSubmit(name.trim(), phone.trim());
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0c0e14] px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex-1 flex flex-col justify-center max-w-[360px] w-full mx-auto">
        <div className="flex flex-col items-center text-center mb-10">
          <AgentAvatar name={agentName} size={72} />
          <h1 className="mt-5 text-[28px] font-semibold tracking-tight leading-tight">{agentName}</h1>
          <p className="mt-2 text-[15px] text-white/55 leading-6">
            שיחה אישית, בדיוק כמו בוואטסאפ — עם הסוכן עצמו.
          </p>
        </div>

        <form onSubmit={handle} className="space-y-3">
          <label className="block">
            <span className="sr-only">שם</span>
            <input
              required
              autoComplete="name"
              autoFocus
              placeholder="השם שלך"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-12 rounded-2xl bg-white/[0.06] border border-white/[0.08] px-4 text-[16px] placeholder:text-white/35 focus:outline-none focus:border-white/25 focus:ring-2 focus:ring-white/10"
            />
          </label>
          <label className="block">
            <span className="sr-only">טלפון</span>
            <input
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="מספר טלפון"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full h-12 rounded-2xl bg-white/[0.06] border border-white/[0.08] px-4 text-[16px] placeholder:text-white/35 focus:outline-none focus:border-white/25 focus:ring-2 focus:ring-white/10"
              dir="ltr"
            />
          </label>
          {error && <p className="text-sm text-rose-300 px-1">{error}</p>}
          <button
            type="submit"
            disabled={busy || !name.trim() || !phone.trim()}
            className="w-full h-12 rounded-2xl bg-white text-[#0c0e14] font-semibold text-[16px] disabled:opacity-40 active:scale-[0.99] transition-transform"
          >
            {busy ? 'נכנס…' : 'התחל שיחה'}
          </button>
        </form>
      </div>
    </div>
  );
}
