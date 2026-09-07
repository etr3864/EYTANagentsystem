'use client';

import { Button } from '@/components/ui';
import type { FunctionTestResult } from '@/lib/agentFunctionTypes';

export function FunctionTestPanel({
  result,
  busy,
  onDry,
  onLive,
}: {
  result: FunctionTestResult | null;
  busy: boolean;
  onDry: () => void;
  onLive: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={onDry} disabled={busy}>
          בדיקה יבשה
        </Button>
        <Button variant="secondary" size="sm" onClick={onLive} disabled={busy}>
          שלח באמת
        </Button>
      </div>
      {result && <ResultView result={result} />}
    </div>
  );
}

function ResultView({ result }: { result: FunctionTestResult }) {
  const tone = result.ok ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="rounded-lg border border-purple-500/10 bg-white/[0.03] p-3 space-y-3 text-sm">
      <div className="flex flex-wrap gap-2 items-center">
        <span className={tone}>{result.ok ? 'הצליח' : 'נכשל'}</span>
        {result.dry && <span className="text-slate-400">dry-run</span>}
        {result.status_code != null && (
          <span className="text-slate-300">{result.status_code}</span>
        )}
        <span className="text-slate-500">{result.latency_ms} ms</span>
      </div>
      {result.error && (
        <p className="text-red-300">{result.error.message_for_model}</p>
      )}
      {Object.keys(result.mapped_outputs || {}).length > 0 && (
        <div>
          <p className="text-slate-400 mb-1">פלטים שנשמרו</p>
          <div className="flex flex-wrap gap-1">
            {Object.entries(result.mapped_outputs).map(([key, value]) => (
              <span key={key} className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-200">
                {key} = {String(value)}
              </span>
            ))}
          </div>
        </div>
      )}
      {result.request && (
        <div>
          <p className="text-slate-400 mb-1">בקשה</p>
          <pre className="text-xs text-slate-300 overflow-auto max-h-32 whitespace-pre-wrap text-left" dir="ltr">
            {result.request.method} {result.request.url}
            {result.request.body ? `\n${result.request.body}` : ''}
          </pre>
        </div>
      )}
      {result.response != null && (
        <div>
          <p className="text-slate-400 mb-1">תשובה</p>
          <JsonTree data={result.response} />
        </div>
      )}
    </div>
  );
}

function JsonTree({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return <span className="text-slate-500">null</span>;
  }
  if (typeof data !== 'object') {
    return <span className="text-slate-200">{String(data)}</span>;
  }
  const entries = Array.isArray(data)
    ? data.map((v, i) => [String(i), v] as const)
    : Object.entries(data as Record<string, unknown>);
  return (
    <div className="text-xs text-slate-300 space-y-0.5 max-h-64 overflow-auto pr-1 text-left" dir="ltr">
      {entries.slice(0, 80).map(([key, value]) => (
        <div key={key} className="flex gap-2">
          <span className="text-slate-500 shrink-0">{key}</span>
          {typeof value === 'object' && value !== null ? (
            <details>
              <summary className="cursor-pointer text-slate-400">אובייקט</summary>
              <div className="pr-2 mt-1">
                <JsonTree data={value} />
              </div>
            </details>
          ) : (
            <span className="break-all">{String(value)}</span>
          )}
        </div>
      ))}
    </div>
  );
}
