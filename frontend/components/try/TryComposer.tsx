'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';

export function TryComposer({
  value,
  onChange,
  onSend,
  onSendFile,
  onSendVoice,
  replyTo,
  onCancelReply,
  locked,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onSendFile: (file: File, caption: string) => void;
  onSendVoice: (blob: Blob) => void;
  replyTo: string | null;
  onCancelReply: () => void;
  locked: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
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
      return;
    }
    if (!send) {
      rec.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setRecording(false);
      };
    }
    rec.stop();
    recRef.current = null;
  }

  if (locked) {
    return (
      <div className="px-4 py-3 text-center text-[13px] text-white/40 border-t border-white/[0.06]">
        השיחה נסגרה
      </div>
    );
  }

  const canSend = Boolean(file || value.trim() || recording);

  return (
    <form
      onSubmit={submit}
      className="px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] bg-[#11141c] border-t border-white/[0.06]"
    >
      {replyTo && (
        <div className="mb-2 mx-1 flex items-start gap-2 rounded-xl bg-white/[0.05] px-3 py-2 border-r-2 border-teal-400/70">
          <p className="flex-1 text-[12px] text-white/70 line-clamp-2">{replyTo}</p>
          <button type="button" onClick={onCancelReply} className="text-white/40 p-1" aria-label="בטל ציטוט">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {file && (
        <div className="mb-2 mx-1 flex items-center gap-2 text-[12px] text-white/70">
          <span className="truncate flex-1">{file.name}</span>
          <button type="button" onClick={() => setFile(null)} className="text-white/40">הסר</button>
        </div>
      )}
      {recording && (
        <div className="mb-2 mx-1 flex items-center gap-2 text-[12px] text-rose-300">
          <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
          מקליט
          <button type="button" onClick={() => stopRecording(false)} className="text-white/50 mr-auto">ביטול</button>
        </div>
      )}
      {micError && <p className="mb-2 mx-1 text-[12px] text-rose-400">{micError}</p>}
      <div className="flex items-end gap-2">
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
          className="w-11 h-11 rounded-full bg-[#1c2230] grid place-items-center shrink-0 disabled:opacity-35"
          aria-label="צרף קובץ"
        >
          <svg className="w-5 h-5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKey}
          placeholder={file ? 'כיתוב (אופציונלי)' : 'הודעה'}
          enterKeyHint="send"
          disabled={recording}
          className="flex-1 max-h-[120px] resize-none rounded-[22px] bg-[#1c2230] px-4 py-2.5 text-[16px] leading-5 placeholder:text-white/35 focus:outline-none disabled:opacity-50"
        />
        {!value.trim() && !file && !recording && (
          <button
            type="button"
            onClick={() => void startRecording()}
            className="w-11 h-11 rounded-full bg-[#1c2230] grid place-items-center shrink-0"
            aria-label="הקלט"
          >
            <svg className="w-5 h-5 text-white/70" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14a3 3 0 003-3V7a3 3 0 10-6 0v4a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2z" />
            </svg>
          </button>
        )}
        <button
          type={recording ? 'button' : 'submit'}
          onClick={recording ? () => stopRecording(true) : undefined}
          disabled={!canSend}
          className="w-11 h-11 rounded-full bg-[#1f8a70] grid place-items-center disabled:opacity-35 shrink-0 active:scale-95 transition-transform"
          aria-label="שלח"
        >
          <svg className="w-5 h-5 text-white -rotate-90" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </form>
  );
}
