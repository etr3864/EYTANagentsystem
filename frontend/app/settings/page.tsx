'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import {
  Button,
  Card,
  CopyIcon,
  Input,
  KeyIcon,
  ListViewport,
  PauseIcon,
  PlayIcon,
  SettingsIcon,
  TrashIcon,
  BELOW_NAV_CLASS,
} from '@/components/ui';
import {
  createMcpToken,
  getMcpConnection,
  listMcpTokens,
  patchMcpToken,
  revokeMcpToken,
  type McpToken,
  type McpTokenCreated,
} from '@/lib/api';

function mcpSnippet(mcpUrl: string, token: string) {
  return JSON.stringify(
    {
      mcpServers: {
        optive: {
          type: 'http',
          url: mcpUrl,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    },
    null,
    2,
  );
}

function formatWhen(iso: string | null) {
  if (!iso) return 'עדיין לא בשימוש';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('he-IL');
}

function asPublicToken(row: McpTokenCreated): McpToken {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    paused: row.paused,
    last_used_at: row.last_used_at,
    created_at: row.created_at,
  };
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

function SettingsPage() {
  const [mcpUrl, setMcpUrl] = useState('');
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<McpTokenCreated | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'token' | 'json' | 'url' | 'cli' | null>(null);

  const load = useCallback(async () => {
    setError('');
    const [connection, list] = await Promise.all([getMcpConnection(), listMcpTokens()]);
    setMcpUrl(connection.mcp_url);
    setTokens(list);
  }, []);

  useEffect(() => {
    load()
      .catch((e) => setError(e instanceof Error ? e.message : 'שגיאה בטעינה'))
      .finally(() => setLoading(false));
  }, [load]);

  const snippetToken = created?.token || 'mcp_PASTE_TOKEN_HERE';
  const snippet = useMemo(
    () => mcpSnippet(mcpUrl || 'https://YOUR_API/mcp', snippetToken),
    [mcpUrl, snippetToken],
  );

  async function handleCreate() {
    setSaving(true);
    setError('');
    try {
      const row = await createMcpToken(name.trim() || 'MCP');
      setCreated(row);
      setMcpUrl(row.mcp_url);
      setTokens((prev) => [asPublicToken(row), ...prev]);
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'יצירת טוקן נכשלה');
    } finally {
      setSaving(false);
    }
  }

  async function handlePause(token: McpToken) {
    setBusyId(token.id);
    setError('');
    try {
      const updated = await patchMcpToken(token.id, { paused: !token.paused });
      setTokens((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'עדכון הטוקן נכשל');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(token: McpToken) {
    if (!confirm(`למחוק את הטוקן "${token.name}" לצמיתות? אי אפשר לשחזר אותו.`)) return;
    setBusyId(token.id);
    setError('');
    try {
      await revokeMcpToken(token.id);
      setTokens((prev) => prev.filter((t) => t.id !== token.id));
      if (created?.id === token.id) setCreated(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'מחיקה נכשלה');
    } finally {
      setBusyId(null);
    }
  }

  async function handleCopy(kind: 'token' | 'json' | 'url' | 'cli', value: string) {
    await copyText(value);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  const displayUrl = mcpUrl || 'https://YOUR_API/mcp';
  const cliSnippet = `claude mcp add --transport http optive ${displayUrl} --header "Authorization: Bearer ${snippetToken}"`;

  return (
    <div className={`flex flex-col ${BELOW_NAV_CLASS}`}>
      <ListViewport>
      <div className="max-w-3xl mx-auto px-3 md:px-6 py-6 pb-16 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-purple-300" />
          הגדרות
        </h1>
        <p className="text-slate-400 mt-1">
          טוקני MCP למנהל ראשי. מי שיש לו טוקן פעיל פועל בשמך בדשבורד, ב-API וב-MCP.
          אין תפוגה. השהה כדי לחתוך גישה זמנית, או מחק כדי לבטל לצמיתות.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <Card>
        <h2 className="text-lg font-medium text-white mb-2">מה זה MCP</h2>
        <p className="text-slate-300 text-sm leading-relaxed">
          MCP מחבר לאופטיב כל כלי שתומך בפרוטוקול, כולל Cursor, Claude Desktop, Claude Code,
          VS Code ו-Windsurf. אחרי החיבור אפשר לבנות סוכנים, לנהל לקוחות ועובדים,
          ולראות עלויות וביצועים לפי סוכן כמו בדשבורד.
        </p>
        <p className="text-slate-400 text-sm mt-3">
          שליחת הודעה ללקוח, מחיקות ואיפוס סיסמה דורשים מהמודל confirm=true.
          חיבור WhatsApp או יומן גוגל נפתח בדפדפן. ה-MCP רק מחזיר קישור.
        </p>
      </Card>

      <Card>
        <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <KeyIcon className="w-5 h-5 text-purple-300" />
          טוקנים
        </h2>

        {created && (
          <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
            <p className="text-amber-100 text-sm font-medium">
              הטוקן מוצג פעם אחת. העתק עכשיו, אחרי רענון הוא לא יופיע שוב.
            </p>
            <div className="flex items-start gap-2">
              <code className="flex-1 text-xs md:text-sm break-all bg-black/40 rounded-md px-3 py-2 text-emerald-300">
                {created.token}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<CopyIcon />}
                onClick={() => handleCopy('token', created.token)}
              >
                {copied === 'token' ? 'הועתק' : 'העתק'}
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 sm:items-end mb-5">
          <div className="flex-1">
            <Input
              label="כותרת"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Claude / Cursor / מק"
              maxLength={80}
            />
          </div>
          <Button type="button" onClick={handleCreate} loading={saving} disabled={loading}>
            צור טוקן
          </Button>
        </div>

        {loading ? (
          <div className="h-20 rounded-lg skeleton" />
        ) : tokens.length === 0 ? (
          <p className="text-slate-400 text-sm">אין טוקנים עדיין. צור אחד כדי לחבר כלי MCP.</p>
        ) : (
          <ul className="divide-y divide-purple-500/10">
            {tokens.map((token) => (
              <li key={token.id} className="py-3 flex items-center justify-between gap-3">
                <div className={`min-w-0 ${token.paused ? 'opacity-50' : ''}`}>
                  <p className="text-white text-sm font-medium truncate flex items-center gap-2">
                    {token.name}
                    {token.paused && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-amber-500/20 text-amber-200">
                        מושהה
                      </span>
                    )}
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {token.prefix}… · {formatWhen(token.last_used_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={token.paused ? <PlayIcon /> : <PauseIcon />}
                    disabled={busyId === token.id}
                    onClick={() => handlePause(token)}
                  >
                    {token.paused ? 'הפעל' : 'השהה'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={<TrashIcon />}
                    disabled={busyId === token.id}
                    onClick={() => handleDelete(token)}
                  >
                    מחק
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-medium text-white mb-3">חיבור לכלי MCP</h2>
        <p className="text-slate-300 text-sm leading-relaxed mb-3">
          שרת HTTP מרוחק. אותו URL ואותו Bearer עובדים בכל לקוח MCP שתומך בחיבור כזה.
        </p>
        <ol className="list-decimal pr-5 space-y-2 text-sm text-slate-300 leading-relaxed">
          <li>צור טוקן למעלה והעתק אותו.</li>
          <li>
            בכלי שלך הוסף שרת MCP מרוחק (HTTP): URL, ואז כותרת{' '}
            <code className="text-purple-300">Authorization: Bearer TOKEN</code>
            . רוב הכלים מקבלים את ה-JSON למטה.
          </li>
          <li>הפעל את השרת <span className="text-white">optive</span>.</li>
          <li>
            בצ׳אט חדש יופיעו כלים כמו <code className="text-purple-300">list_agents</code>
            {' '}ו-<code className="text-purple-300">get_agent_performance</code>.
          </li>
        </ol>
        <p className="text-slate-500 text-xs mt-3">
          שמור את הטוקן אצלך, לא בריפו משותף. מי שיש לו את הטוקן פועל בשמך.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-400">URL</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<CopyIcon />}
                disabled={!mcpUrl}
                onClick={() => handleCopy('url', displayUrl)}
              >
                {copied === 'url' ? 'הועתק' : 'העתק URL'}
              </Button>
            </div>
            <code className="block text-xs md:text-sm break-all bg-black/40 rounded-lg px-3 py-2 text-slate-200 text-left" dir="ltr">
              {displayUrl}
            </code>
          </div>

          <div>
            <div className="flex justify-end mb-1.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<CopyIcon />}
                disabled={!mcpUrl}
                onClick={() => handleCopy('json', snippet)}
              >
                {copied === 'json' ? 'הועתק' : 'העתק JSON'}
              </Button>
            </div>
            <pre className="text-xs md:text-sm overflow-x-auto bg-black/40 rounded-lg p-4 text-slate-200 text-left" dir="ltr">
              {snippet}
            </pre>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-400">Claude Code</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<CopyIcon />}
                disabled={!mcpUrl}
                onClick={() => handleCopy('cli', cliSnippet)}
              >
                {copied === 'cli' ? 'הועתק' : 'העתק פקודה'}
              </Button>
            </div>
            <pre className="text-xs md:text-sm overflow-x-auto bg-black/40 rounded-lg p-4 text-slate-200 text-left" dir="ltr">
              {cliSnippet}
            </pre>
          </div>
        </div>
        {!created && (
          <p className="text-amber-200/80 text-xs mt-3">
            אחרי יצירת טוקן, ה-JSON יכלול אותו אוטומטית. עד אז מופיע מקום להדבקה.
          </p>
        )}
      </Card>
      </div>
      </ListViewport>
    </div>
  );
}

export default function Page() {
  return (
    <AuthGuard allowedRoles={['super_admin']}>
      <SettingsPage />
    </AuthGuard>
  );
}
