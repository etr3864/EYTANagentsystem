'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { QrImage, useQrSeconds } from '@/components/channels/QrImage';
import { getPublicWasenderQr, refreshPublicWasenderQr } from '@/lib/api';

export default function WaQrPage() {
  const params = useParams();
  const token = String(params.token || '');
  const [status, setStatus] = useState('');
  const [connected, setConnected] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const secondsLeft = useQrSeconds(!connected && qr ? qr : null);

  function apply(row: { status: string; connected: boolean; phone: string | null; qr: string | null }, keepQr = false) {
    setStatus(row.status);
    setConnected(row.connected);
    setPhone(row.phone);
    if (!keepQr) setQr(row.qr);
  }

  useEffect(() => {
    if (!token) return;
    refreshPublicWasenderQr(token)
      .then((row) => apply(row))
      .catch(() => {
        getPublicWasenderQr(token)
          .then((row) => apply(row))
          .catch(() => setGone(true));
      });
    const timer = window.setInterval(() => {
      getPublicWasenderQr(token)
        .then((row) => apply(row, true))
        .catch(() => setGone(true));
    }, 4000);
    return () => window.clearInterval(timer);
  }, [token]);

  async function handleRefresh() {
    setBusy(true);
    setError('');
    try {
      const row = await refreshPublicWasenderQr(token);
      setStatus(row.status);
      setConnected(row.connected);
      setPhone(row.phone);
      setQr(row.qr);
    } catch {
      setError('לא הצלחנו לרענן. לחץ שוב.');
    } finally {
      setBusy(false);
    }
  }

  if (gone) {
    return (
      <main className="min-h-screen px-5 py-10 max-w-md mx-auto text-center" dir="rtl">
        <h1 className="text-xl font-semibold mb-3">הקישור לא עובד</h1>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          הוא פג או שכבר לא בתוקף. תבקש מאיתנו קישור חדש.
        </p>
      </main>
    );
  }

  if (connected) {
    return (
      <main className="min-h-screen px-5 py-10 max-w-md mx-auto text-center" dir="rtl">
        <h1 className="text-xl font-semibold mb-3">מחובר</h1>
        <p className="text-[var(--text-secondary)] leading-relaxed">
          הוואטסאפ התחבר. אפשר לסגור את הדף.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 py-8 max-w-md mx-auto" dir="rtl">
      <h1 className="text-xl font-semibold text-center mb-2">חיבור וואטסאפ</h1>
      {phone && (
        <p className="text-center text-sm text-[var(--text-muted)] mb-6" dir="ltr">
          {phone}
        </p>
      )}

      <ol className="text-[15px] leading-7 text-[var(--ink)] space-y-3 mb-6 list-decimal pr-5">
        <li>פתח את הדף הזה במחשב או בטלפון אחר — לא בטלפון של הוואטסאפ.</li>
        <li>בטלפון של הוואטסאפ: הגדרות ← מכשירים מקושרים ← קישור מכשיר.</li>
        <li>צלם עם המצלמה את הריבוע כאן למטה.</li>
        <li>אם הריבוע נעלם או לא עובד — לחץ «ברקוד חדש».</li>
      </ol>

      {qr ? (
        <div className="space-y-3">
          <QrImage value={qr} className="w-64 h-64 mx-auto rounded-2xl bg-white p-2" />
          <p className={`text-center text-sm tabular-nums ${secondsLeft === 0 ? 'text-red-400' : 'text-[var(--text-secondary)]'}`}>
            {secondsLeft === 0
              ? 'הברקוד פג. לחץ ברקוד חדש.'
              : `בתוקף עוד ${secondsLeft} שניות`}
          </p>
        </div>
      ) : (
        <p className="text-center text-sm text-[var(--text-secondary)] py-10">
          {status === 'connecting' ? 'מתחבר…' : 'לוחצים על ברקוד חדש כדי לראות את הריבוע.'}
        </p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={handleRefresh}
        className="mt-6 w-full py-3 rounded-2xl text-base font-medium bg-[var(--ink)] text-[var(--bg)] disabled:opacity-40"
      >
        {busy ? 'טוען…' : 'ברקוד חדש'}
      </button>
      {error && <p className="text-center text-sm text-red-400 mt-3">{error}</p>}
    </main>
  );
}
