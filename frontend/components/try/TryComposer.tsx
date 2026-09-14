'use client';

import { FormEvent, KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
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
      <div className="px-4 py-3 text-center text-[13px] text-white/40">
        השיחה נסגרה
      </div>
    );
  }

  const canSend = Boolean(file || value.trim());

  return (
    <form
      onSubmit={submit}
      className={`px-3 pt-2 ${keyboardOpen ? 'pb-2' : 'pb-[max(0.6rem,env(safe-area-inset-bottom))]'}`}
    >
      {replyTo && (
        <div className="mb-2 mx-1 flex items-start gap-2 try-glass px-3 py-2 rounded-[20px_16px_22px_14px] border-r border-white/20">
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
      {micError && <p className="mb-2 mx-1 text-[12px] text-rose-400">{micError}</p>}
      {recording ? (
        <div className="flex items-center gap-3 try-glass try-dock rounded-[28px_22px_30px_20px] px-3 h-12">
          <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse shrink-0" />
          <RecordMeter stream={liveStream} />
          <span className="text-[12px] text-white/70">מקליט</span>
          <button type="button" onClick={() => stopRecording(false)} className="text-white/50 mr-auto text-[12px]">
            ביטול
          </button>
          <SendDisc onClick={() => stopRecording(true)} />
        </div>
      ) : (
        <div className="flex items-end gap-0.5 try-glass try-dock rounded-[28px_22px_30px_20px] p-1 pl-1.5">
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
          <IconButton onClick={() => fileRef.current?.click()} label="צרף קובץ">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </IconButton>
          <textarea
            ref={ref}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => window.scrollTo(0, 0)}
            onKeyDown={onKey}
            placeholder={file ? 'כיתוב (אופציונלי)' : 'הודעה'}
            enterKeyHint="send"
            className="flex-1 max-h-[120px] min-h-[40px] resize-none bg-transparent px-2 py-2.5 text-[16px] leading-5 placeholder:text-white/35 outline-none focus:outline-none focus-visible:outline-none"
          />
          {!canSend && (
            <IconButton onClick={() => void startRecording()} label="הקלט">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14a3 3 0 003-3V7a3 3 0 10-6 0v4a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2z" />
              </svg>
            </IconButton>
          )}
          {canSend && <SendDisc submit />}
        </div>
      )}
    </form>
  );
}

function SendDisc({
  submit,
  onClick,
}: {
  submit?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type={submit ? 'submit' : 'button'}
      onClick={onClick}
      className="try-send w-10 h-10 rounded-[13px] bg-[#efeae3] text-[#16141a] grid place-items-center shrink-0 active:scale-95 transition-transform"
      aria-label="שלח"
    >
      <svg className="w-[18px] h-[18px] -rotate-90" fill="currentColor" viewBox="0 0 24 24">
        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
      </svg>
    </button>
  );
}

function IconButton({
  children,
  onClick,
  label,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-10 h-10 rounded-full grid place-items-center shrink-0 text-white/70 disabled:opacity-35"
      aria-label={label}
    >
      {children}
    </button>
  );
}
