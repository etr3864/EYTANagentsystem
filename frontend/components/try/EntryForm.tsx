'use client';

import { FormEvent } from 'react';
import { Orb } from './Orb';

export function EntryForm({
  agentName,
  name,
  phone,
  busy,
  error,
  onName,
  onPhone,
  onSubmit,
}: {
  agentName: string;
  name: string;
  phone: string;
  busy: boolean;
  error: string | null;
  onName: (v: string) => void;
  onPhone: (v: string) => void;
  onSubmit: () => Promise<void>;
}) {
  async function handle(e: FormEvent) {
    e.preventDefault();
    await onSubmit();
  }

  return (
    <div className="relative flex-1 flex items-center justify-center px-4 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
      <div className="try-rise w-full max-w-[440px]">
        <div className="relative mx-auto mb-8 w-[104px] h-[104px]">
          <Orb size={104} ornate />
        </div>
        <h1 className="m-0 mb-3 text-[clamp(26px,8vw,38px)] leading-[1.1] font-extrabold tracking-[-0.02em] text-center text-pretty">
          {agentName}
        </h1>
        <p className="m-0 mb-8 text-[16px] leading-[1.55] text-center text-[color:var(--ink-dim)] text-pretty">
          שיחה אישית עם הסוכן עצמו, בדיוק כמו בוואטסאפ.
        </p>
        <form onSubmit={handle} className="try-glass relative p-[22px] rounded-[26px] overflow-hidden">
          <div
            className="absolute top-0 left-0 w-[40%] h-full pointer-events-none"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.10), transparent)',
              animation: 'try-sheen 7s ease-in-out infinite',
            }}
          />
          <div className="relative flex flex-col gap-3">
            <input
              required
              autoComplete="name"
              autoFocus
              placeholder="השם שלך"
              value={name}
              onFocus={() => window.scrollTo(0, 0)}
              onChange={(e) => onName(e.target.value)}
              className="try-field"
            />
            <input
              required
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="מספר טלפון"
              value={phone}
              dir="ltr"
              onFocus={() => window.scrollTo(0, 0)}
              onChange={(e) => onPhone(e.target.value)}
              className="try-field"
            />
            {error && <p className="text-sm text-rose-300 px-1">{error}</p>}
            <button
              type="submit"
              disabled={busy || !name.trim() || !phone.trim()}
              className="try-cta mt-1"
            >
              {busy ? 'נכנס…' : 'התחל שיחה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
