'use client';

type FnNote = {
  name: string;
  status: string;
  ms: number;
  error?: string | null;
  body?: unknown;
};

function parseNote(content: string): FnNote {
  try {
    const data = JSON.parse(content);
    if (data && typeof data === 'object' && typeof data.name === 'string') {
      return {
        name: data.name,
        status: String(data.status || ''),
        ms: Number(data.ms) || 0,
        error: data.error ?? null,
        body: data.body,
      };
    }
  } catch {
    /* older one-line notes: "weather · 180ms" / "weather · נכשל" */
  }
  const failed = content.includes('נכשל');
  const name = content.split('·')[0]?.trim() || 'function';
  const msMatch = content.match(/(\d+)\s*ms/);
  return { name, status: failed ? 'error' : 'ok', ms: msMatch ? Number(msMatch[1]) : 0 };
}

function bodyText(note: FnNote): string {
  if (note.body == null) {
    return note.status === 'ok' ? 'אין גוף תשובה' : note.error || 'אין פירוט';
  }
  return typeof note.body === 'string' ? note.body : JSON.stringify(note.body, null, 2);
}

export function FunctionNote({ content }: { content: string }) {
  const note = parseNote(content);
  const ok = note.status === 'ok';
  const label = ok
    ? `${note.name}${note.ms ? ` · ${note.ms}ms` : ''}`
    : `${note.name} · נכשל`;

  return (
    <details className="group w-fit max-w-full open:w-[min(90vw,28rem)]">
      <summary
        className={`cursor-pointer list-none inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-none [&::-webkit-details-marker]:hidden ${
          ok
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
            : 'border-rose-500/35 bg-rose-500/10 text-rose-100'
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
        <span>פונקציה · {label}</span>
        <span className="text-[9px] opacity-50 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <pre
        className="mt-1.5 max-h-40 overflow-auto rounded-md border border-white/10 bg-black/40 p-2 text-[10px] leading-relaxed text-slate-300 whitespace-pre-wrap text-left"
        dir="ltr"
      >
        {note.error ? `error: ${note.error}\n\n` : ''}
        {bodyText(note)}
      </pre>
    </details>
  );
}
