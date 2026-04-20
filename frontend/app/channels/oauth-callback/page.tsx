'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { CHANNEL_ICONS, CHANNEL_DISPLAY_NAMES } from '@/lib/channels';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface InstagramAccount {
  id: string;
  name: string;
  username?: string;
}

interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: InstagramAccount;
}

interface OAuthSession {
  agent_id: number;
  channel_type: string;
  access_token: string;
  token_expires_at?: string;
  pages: MetaPage[];
}

function authHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function OAuthCallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [session, setSession] = useState<OAuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get('session');
    const fallback = searchParams.get('fallback');
    const errorParam = searchParams.get('error');

    if (errorParam === 'oauth_failed') {
      setError('החיבור למטא נכשל. אנא נסה שנית.');
      setLoading(false);
      return;
    }

    if (fallback && searchParams.get('data')) {
      try {
        const decoded = atob(searchParams.get('data')!.replace(/-/g, '+').replace(/_/g, '/'));
        setSession(JSON.parse(decoded));
        setLoading(false);
      } catch {
        setError('שגיאה בפענוח נתוני הcallback.');
        setLoading(false);
      }
      return;
    }

    if (!sessionId) {
      setError('חסר session ID בURL.');
      setLoading(false);
      return;
    }

    fetch(`${API_URL}/api/channels/oauth-session/${sessionId}`, {
      headers: authHeaders() as HeadersInit,
    })
      .then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.detail || 'Session לא נמצא או פג תוקף');
        }
        return r.json();
      })
      .then((data: OAuthSession) => {
        setSession(data);
        if (data.pages.length === 1) {
          setSelectedPageId(data.pages[0].id);
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [searchParams]);

  async function handleConnect() {
    if (!session || !selectedPageId) return;
    const page = session.pages.find(p => p.id === selectedPageId);
    if (!page) return;

    setSubmitting(true);
    setError(null);

    const igAccount = page.instagram_business_account;
    const externalAccountId = session.channel_type === 'instagram'
      ? (igAccount?.id || page.id)
      : page.id;

    try {
      const res = await fetch(`${API_URL}/api/agents/${session.agent_id}/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authHeaders() as Record<string, string>),
        },
        body: JSON.stringify({
          channel_type: session.channel_type,
          access_token: page.access_token || session.access_token,
          external_account_id: externalAccountId,
          account_name: igAccount?.username || page.name || null,
          page_id: page.id,
          waba_id: null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'שגיאה ביצירת הערוץ');
      }

      router.push(`/agent/${session.agent_id}?tab=channels&connected=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה ביצירת הערוץ');
      setSubmitting(false);
    }
  }

  const channelName = session
    ? (CHANNEL_DISPLAY_NAMES[session.channel_type as keyof typeof CHANNEL_DISPLAY_NAMES] ?? session.channel_type)
    : '';
  const channelIcon = session
    ? (CHANNEL_ICONS[session.channel_type as keyof typeof CHANNEL_ICONS] ?? '📡')
    : '';

  return (
    <div className="min-h-screen bg-[#0e0b1a] flex items-center justify-center p-4" dir="rtl">
      <div className="bg-[#131020] border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">

        {loading && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">טוען נתוני חיבור...</p>
          </div>
        )}

        {!loading && error && (
          <div className="space-y-4">
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
            <button
              onClick={() => router.back()}
              className="w-full py-2 rounded-lg bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors"
            >
              ← חזרה
            </button>
          </div>
        )}

        {!loading && !error && session && (
          <>
            <div className="flex items-center gap-3 mb-6">
              <span className="text-3xl">{channelIcon}</span>
              <div>
                <h1 className="text-lg font-semibold text-white">בחר חשבון {channelName}</h1>
                <p className="text-xs text-slate-400">
                  לסוכן #{session.agent_id}
                </p>
              </div>
            </div>

            {session.pages.length === 0 ? (
              <div className="space-y-4">
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-sm">
                  לא נמצאו דפים/חשבונות זמינים עבור ערוץ זה.
                  {session.channel_type === 'instagram' && (
                    <p className="mt-1 text-xs">
                      ודא שחשבון Instagram Business/Creator מחובר לדף Facebook שלך.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => router.back()}
                  className="w-full py-2 rounded-lg bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors"
                >
                  ← חזרה
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-400 mb-3">
                  {session.pages.length === 1
                    ? 'נמצא חשבון אחד — לחץ לחבר:'
                    : `נמצאו ${session.pages.length} חשבונות. בחר את הנכון:`}
                </p>

                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {session.pages.map(page => {
                    const ig = page.instagram_business_account;
                    const isSelected = selectedPageId === page.id;
                    return (
                      <button
                        key={page.id}
                        onClick={() => setSelectedPageId(page.id)}
                        className={`w-full text-right p-3 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                            isSelected ? 'border-blue-500 bg-blue-500' : 'border-slate-500'
                          }`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white truncate">
                              {session.channel_type === 'instagram' && ig
                                ? `@${ig.username || ig.name}`
                                : page.name}
                            </div>
                            <div className="text-xs text-slate-400 truncate">
                              {session.channel_type === 'instagram' && ig
                                ? `דף Facebook: ${page.name}`
                                : `ID: ${page.id}`}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => router.back()}
                    disabled={submitting}
                    className="flex-1 py-2.5 rounded-xl bg-slate-700 text-slate-300 text-sm hover:bg-slate-600 transition-colors disabled:opacity-50"
                  >
                    ביטול
                  </button>
                  <button
                    onClick={handleConnect}
                    disabled={!selectedPageId || submitting}
                    className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-all disabled:opacity-40"
                  >
                    {submitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        מחבר...
                      </span>
                    ) : 'חבר ערוץ ✓'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0e0b1a] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <OAuthCallbackInner />
    </Suspense>
  );
}
