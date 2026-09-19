'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { adoptWasenderSessions, getWasenderPat, saveWasenderPat } from '@/lib/api';

export function WasenderPatCard() {
  const [configured, setConfigured] = useState(false);
  const [pat, setPat] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    getWasenderPat()
      .then((row) => setConfigured(row.configured))
      .catch((e) => setError(e instanceof Error ? e.message : 'שגיאה'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      await saveWasenderPat(pat.trim());
      setConfigured(true);
      setPat('');
      setInfo('המפתח נשמר');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  }

  async function handleAdopt() {
    setAdopting(true);
    setError('');
    setInfo('');
    try {
      const result = await adoptWasenderSessions();
      setInfo(`שויכו ${result.matched} סשנים. יתומים: ${result.orphans.length}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שיוך נכשל');
    } finally {
      setAdopting(false);
    }
  }

  return (
    <Card>
      <h2 className="text-lg font-medium text-[var(--ink)] mb-2">WaSender</h2>
      <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-4">
        Personal Access Token של חשבון Optive. נשמר מוצפן. בלי המפתח אי אפשר לפתוח מופע.
      </p>
      {loading ? (
        <div className="h-16 rounded-lg skeleton" />
      ) : (
        <>
          <p className="text-sm mb-3">
            {configured ? (
              <span className="text-emerald-400">מוגדר</span>
            ) : (
              <span className="text-amber-300">לא מוגדר</span>
            )}
          </p>
          <Input
            label={configured ? 'החלפה' : 'PAT'}
            type="password"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="8616|…"
            autoComplete="off"
          />
          <div className="flex flex-wrap gap-2 mt-4">
            <Button type="button" onClick={handleSave} loading={saving} disabled={!pat.trim()}>
              שמור
            </Button>
            {configured && (
              <Button type="button" variant="secondary" onClick={handleAdopt} loading={adopting}>
                שייך סשנים קיימים
              </Button>
            )}
          </div>
        </>
      )}
      {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
      {info && <p className="text-sm text-emerald-400 mt-3">{info}</p>}
    </Card>
  );
}
