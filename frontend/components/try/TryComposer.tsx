'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { RecordMeter } from './RecordMeter';

export function TryComposer({
  value,
  onChange,
  onSend,
  onSendFile,
  onSendVoice,
  replyTo,
  onCancelReply,
  locked,
  keyboardOpen = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onSendFile: (file: File, caption: string) => void;
  onSendVoice: (blob: Blob) => void;
  replyTo: string | null;
  onCancelReply: () => void;
  locked: boolean;
  keyboardOpen?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (locked || recording) return;
    if (file) {
      onSendFile(file, value.trim());
      setFile(null);
      onChange('');
      return;
    }
    if (!value.trim()) return;
    onSend();
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  async function startRecording() {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setLiveStream(stream);
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setLiveStream(null);
        setRecording(false);
        if (blob.size > 0) onSendVoice(blob);
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setMicError('אין גישה למיקרופון');
    }
  }

  function stopRecording(send: boolean) {
    const rec = recRef.current;
    if (!rec || rec.state === 'inactive') {
      setRecording(false);
      setLiveStream(null);
      return;
    }
    if (!send) {
      rec.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setLiveStream(null);
        setRecording(false);
      };
    }
    rec.stop();
    recRef.current = null;
  }

  if (locked) {
    return (
      <div className="px-4 py-3 text-center text-[13px] text-[color:var(--ink-faint)]">
        השיחה נסגרה
      </div>
    );
  }

  const canSend = Boolean(file || value.trim());

  return (
    <form
      onSubmit={submit}
      className={keyboardOpen ? 'pb-2' : 'pb-[max(0.4rem,env(safe-area-inset-bottom))]'}
    >
      {replyTo && (
        <div className="try-glass mb-2 flex items-start gap-2 rounded-[22px] px-3 py-2 border-r border-[var(--edge-strong)]">
          <p className="flex-1 text-[12px] text-[color:var(--ink-dim)] line-clamp-2">{replyTo}</p>
          <button type="button" onClick={onCancelReply} className="text-[color:var(--ink-faint)] p-1" aria-label="בטל ציטוט">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {file && (
        <div className="mb-2 mx-1 flex items-center gap-2 text-[12px] text-[color:var(--ink-dim)]">
          <span className="truncate flex-1">{file.name}</span>
          <button type="button" onClick={() => setFile(null)} className="text-[color:var(--ink-faint)]">הסר</button>
        </div>
      )}
      {micError && <p className="mb-2 mx-1 text-[12px] text-rose-400">{micError}</p>}
      <div className="try-glass try-composer">
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden rounded-[inherit]"
          aria-hidden
        >
          <div
            className="absolute w-[60%] h-[300%] -top-full right-[8%] opacity-60"
            style={{
              background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.15), transparent 58%)',
              animation: 'try-inner 21s ease-in-out infinite reverse',
            }}
          />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf,audio/*"
          className="hidden"
          onChange={(e) => {
            const next = e.target.files?.[0];
            if (next) setFile(next);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={recording}
          onClick={() => fileRef.current?.click()}
          className="try-icon"
          aria-label="צרף קובץ"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M12 6v12M6 12h12" />
          </svg>
        </button>
        {recording ? (
          <div className="relative flex-1 min-w-0 flex items-center gap-3 py-2">
            <RecordMeter stream={liveStream} />
            <span className="text-[12px] text-[color:var(--ink-dim)]">מקליט</span>
            <button type="button" onClick={() => stopRecording(false)} className="ms-auto text-[12px] text-[color:var(--ink-faint)]">
              ביטול
            </button>
          </div>
        ) : (
          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => window.scrollTo(0, 0)}
            onKeyDown={onKey}
            placeholder={file ? 'כיתוב (אופציונלי)' : 'כתוב הודעה…'}
            enterKeyHint="send"
            className="relative flex-1 min-w-0 max-h-[120px] min-h-[42px] resize-none bg-transparent px-1.5 py-3 text-[16px] leading-5 text-[color:var(--ink)] placeholder:text-[color:var(--ink-faint)] outline-none"
          />
        )}
        <button
          type="button"
          onClick={() => (recording ? stopRecording(true) : void startRecording())}
          className={`try-icon relative overflow-hidden ${recording ? 'is-rec' : ''}`}
          aria-label={recording ? 'שלח הקלטה' : 'הקלט'}
        >
          {recording && (
            <span
              className="absolute inset-0 rounded-full border border-[var(--acc)]"
              style={{ animation: 'try-ring 1.8s ease-out infinite' }}
            />
          )}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
        <button
          type={recording ? 'button' : 'submit'}
          onClick={recording ? () => stopRecording(true) : undefined}
          disabled={!canSend && !recording}
          className="try-send"
          aria-label="שלח"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20V5M6 11l6-6 6 6" />
          </svg>
        </button>
      </div>
    </form>
  );
}
