'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, ListPager, ListViewport } from '@/components/ui';
import { paginate } from '@/lib/pagination';
import { parseUTCDate } from '@/lib/dates';
import { TestersPanel } from './TestersPanel';
import { TesterThread } from './TesterThread';
import {
  DEFAULT_TOKEN_LIMIT,
  LINK_STATUS,
  TOKEN_LIMIT_PRESETS,
  estimateMessages,
  formatTokenLimit,
  messagesApproxLabel,
  parseTokenLimit,
  publicUrl,
  statusBadge,
  tokenLimitError,
  tokensLabel,
} from './labels';
import {
  createPlaygroundLink,
  deletePlaygroundLink,
  listPlaygroundLinks,
  listPlaygroundTesters,
  restorePlaygroundLink,
  stopPlaygroundLink,
  type PlaygroundLinkRow,
  type PlaygroundTester,
} from '@/lib/api/playground';

const TTL_OPTIONS = [
  { seconds: 3600, label: 'שעה' },
  { seconds: 86400, label: '24 שעות' },
  { seconds: 604800, label: '7 ימים' },
  { seconds: 2592000, label: '30 ימים' },
];

function whenLabel(iso: string | null, prefix: string): string {
  const date = parseUTCDate(iso);
  if (!date) return '';
  return `${prefix} ${date.toLocaleString('he-IL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export function PlaygroundLinksTab({ agentId }: { agentId: number }) {
  const [rows, setRows] = useState<PlaygroundLinkRow[]>([]);
  const [ttl, setTtl] = useState(604800);
  const [tokenDraft, setTokenDraft] = useState(formatTokenLimit(DEFAULT_TOKEN_LIMIT));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [openLink, setOpenLink] = useState<PlaygroundLinkRow | null>(null);
  const [testers, setTesters] = useState<PlaygroundTester[]>([]);
  const [testersLoading, setTestersLoading] = useState(false);
  const [openTesterId, setOpenTesterId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  const reload = useCallback(async () => {
    const data = await listPlaygroundLinks(agentId);
    setRows(data);
    setOpenLink((current) => (current ? data.find((row) => row.id === current.id) || current : null));
  }, [agentId]);

  useEffect(() => {
    reload().catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [reload]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl(row: PlaygroundLinkRow) {
    const url = publicUrl(row.url);
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopiedId(row.id);
    window.setTimeout(() => setCopiedId((id) => (id === row.id ? null : id)), 1600);
  }

  async function openTesters(row: PlaygroundLinkRow) {
    setOpenLink(row);
    setOpenTesterId(null);
    setTestersLoading(true);
    setError(null);
    try {
      setTesters(await listPlaygroundTesters(agentId, row.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setTestersLoading(false);
    }
  }

  if (openLink && openTesterId != null) {
    return (
      <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
        <TesterThread
          agentId={agentId}
          linkId={openLink.id}
          userId={openTesterId}
          onBack={() => setOpenTesterId(null)}
        />
      </div>
    );
  }

  if (openLink) {
    return (
      <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
        {error && <p className="text-sm text-red-400">{error}</p>}
        <TestersPanel
          agentId={agentId}
          link={openLink}
          testers={testers}
          loading={testersLoading}
          onBack={() => { setOpenLink(null); setTesters([]); }}
          onOpen={(id) => setOpenTesterId(id)}
        />
      </div>
    );
  }

  const paged = paginate(rows, page);

  return (
    <div className="h-full min-h-0 flex flex-col gap-4">
      <Card padding="md" className="shrink-0">
        <h2 className="text-base font-semibold text-white">קישורי בדיקה</h2>
        <p className="text-sm text-slate-400 mt-1 mb-5">
          הפונקציות רצות באמת עם המספר שהבודק יקליד. תיאום פגישות נשאר בשיחה ולא נכתב ליומן גוגל.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-[11rem_minmax(0,1fr)_auto] gap-3 items-end">
          <label className="text-xs text-slate-400">
            תוקף
            <select
              className="mt-1.5 block w-full px-3 py-2.5 bg-slate-800/50 border border-slate-600/50 rounded-lg text-sm text-white"
              value={ttl}
              onChange={(e) => setTtl(Number(e.target.value))}
            >
              {TTL_OPTIONS.map((opt) => (
                <option key={opt.seconds} value={opt.seconds}>{opt.label}</option>
              ))}
            </select>
          </label>
          <TokenLimitField value={tokenDraft} onChange={setTokenDraft} />
          <Button disabled={busy} onClick={() => {
            const parsed = parseTokenLimit(tokenDraft);
            const limitErr = tokenLimitError(parsed);
            if (limitErr || parsed == null) {
              setError(limitErr || 'תקרת טוקנים לא תקינה');
              return;
            }
            setPage(1);
            return run(() => createPlaygroundLink(agentId, ttl, parsed));
          }}>
            צור קישור
          </Button>
        </div>
        <p className="text-xs text-slate-500 mt-5 mb-2">בחירה מהירה</p>
        <TokenLimitPresets value={tokenDraft} onChange={setTokenDraft} />
        <TokenLimitHint value={tokenDraft} />
      </Card>

      {error && <p className="text-sm text-red-400 shrink-0">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-400">טוען…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-400 px-1">אין קישורים עדיין — צור אחד למעלה</p>
      ) : (
        <ListViewport
          footer={(
            <ListPager
              page={paged.page}
              totalPages={paged.totalPages}
              from={paged.from}
              to={paged.to}
              total={paged.total}
              onPage={setPage}
            />
          )}
        >
          <div className="space-y-2">
            {paged.items.map((row) => (
              <LinkRow
                key={row.id}
                row={row}
                busy={busy}
                copied={copiedId === row.id}
                onCopy={() => copyUrl(row)}
                onOpen={() => openTesters(row)}
                onStop={() => run(() => stopPlaygroundLink(agentId, row.id))}
                onRestore={() => run(() => restorePlaygroundLink(agentId, row.id))}
                onDelete={() => {
                  if (!window.confirm('להסתיר את הקישור? הבודקים לא ייכנסו. ההתכתבויות נשארות במערכת.')) return;
                  return run(() => deletePlaygroundLink(agentId, row.id));
                }}
              />
            ))}
          </div>
        </ListViewport>
      )}
    </div>
  );
}

function TokenLimitField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const parsed = parseTokenLimit(value);
  return (
    <label className="text-xs text-slate-400 min-w-0">
      תקרת טוקנים — הקלדה ידנית
      <input
        dir="ltr"
        inputMode="numeric"
        autoComplete="off"
        placeholder="1,000,000"
        className="mt-1.5 block w-full px-3 py-2.5 bg-slate-800/50 border border-slate-600/50 rounded-lg text-sm text-white text-left tabular-nums"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (parsed != null) onChange(formatTokenLimit(parsed));
        }}
      />
    </label>
  );
}

function TokenLimitHint({ value }: { value: string }) {
  const parsed = parseTokenLimit(value);
  const err = tokenLimitError(parsed);
  return (
    <p className={`mt-3 text-sm ${err ? 'text-red-400' : 'text-slate-400'}`}>
      {err || (parsed != null ? messagesApproxLabel(parsed) : '')}
    </p>
  );
}

function TokenLimitPresets({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const parsed = parseTokenLimit(value);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {TOKEN_LIMIT_PRESETS.map((opt) => {
        const selected = parsed === opt.tokens;
        return (
          <button
            key={opt.tokens}
            type="button"
            onClick={() => onChange(formatTokenLimit(opt.tokens))}
            className={`rounded-xl border px-3 py-3 text-right transition-colors ${
              selected
                ? 'border-purple-500/50 bg-purple-500/15 text-white'
                : 'border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-white/20'
            }`}
          >
            <span className="block text-sm font-medium">{opt.label}</span>
            <span className="block text-xs text-slate-500 mt-1">
              ~{estimateMessages(opt.tokens).toLocaleString('he-IL')} הודעות
            </span>
          </button>
        );
      })}
    </div>
  );
}

function LinkRow({
  row,
  busy,
  copied,
  onCopy,
  onOpen,
  onStop,
  onRestore,
  onDelete,
}: {
  row: PlaygroundLinkRow;
  busy: boolean;
  copied: boolean;
  onCopy: () => void;
  onOpen: () => void;
  onStop: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const usage = tokensLabel(row.tokens_used, row.token_limit);
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <button type="button" onClick={onOpen} className="min-w-0 text-right flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${statusBadge(row.status)}`}>
              {LINK_STATUS[row.status] || row.status}
            </span>
            <span className="text-sm text-white">
              {row.tester_count} בודקים · {row.conversation_count} שיחות
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            {[
              whenLabel(row.expires_at, row.status === 'expired' ? 'פג' : 'עד'),
              usage,
            ].filter(Boolean).join(' · ')}
          </p>
        </button>
        <div className="flex flex-wrap gap-2">
          {row.url && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={onCopy}>
              {copied ? 'הועתק' : 'העתק קישור'}
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onOpen}>
            התכתבויות
          </Button>
          {row.status === 'active' && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onStop}>עצור</Button>
          )}
          {(row.status === 'stopped' || row.status === 'expired') && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onRestore}>שחזר</Button>
          )}
          {row.status !== 'deleted' && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={onDelete}>הסתר</Button>
          )}
        </div>
      </div>
    </div>
  );
}
