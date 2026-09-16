'use client';

import { useEffect, useRef, useState } from 'react';
import { PaperclipIcon, SendIcon, VoiceIcon, XIcon } from '@/components/ui/Icons';

interface FreeformComposerProps {
  allowVoice: boolean;
  allowImages: boolean;
  allowFiles: boolean;
  onSendText: (text: string) => Promise<void>;
  onSendMedia: (file: File, caption: string, asVoice?: boolean) => Promise<void>;
  onSendVoice: (blob: Blob) => Promise<void>;
  error: string | null;
  setError: (v: string | null) => void;
}

export function FreeformComposer({
  allowVoice,
  allowImages,
  allowFiles,
  onSendText,
  onSendMedia,
  onSendVoice,
  error,
  setError,
}: FreeformComposerProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const canAttach = allowImages || allowFiles;
  const accept = [
    allowImages ? 'image/*,video/*' : '',
    allowFiles ? '.pdf,.doc,.docx,.xls,.xlsx,.txt,application/pdf' : '',
  ].filter(Boolean).join(',');

  useEffect(() => () => stopStream(), []);

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  async function run(fn: () => Promise<void>) {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await fn();
      setText('');
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שליחה נכשלה');
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    if (file) {
      await run(() => onSendMedia(file, text.trim()));
      return;
    }
    if (!text.trim()) return;
    await run(() => onSendText(text.trim()));
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = e => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        stopStream();
        setRecording(false);
        if (blob.size > 0) {
          void run(() => onSendVoice(blob));
        }
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError('אין גישה למיקרופון');
    }
  }

  function cancelRecording() {
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = () => {
        stopStream();
        setRecording(false);
      };
      rec.stop();
    } else {
      stopStream();
      setRecording(false);
    }
    recRef.current = null;
    chunksRef.current = [];
  }

  function finishRecording() {
    recRef.current?.stop();
    recRef.current = null;
  }

  return (
    <div className="space-y-2">
      {file && (
        <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] bg-[var(--glass-2)] rounded-2xl px-3 py-2">
          <span className="truncate flex-1">{file.name}</span>
          <button type="button" onClick={() => setFile(null)} className="text-[var(--text-secondary)] hover:text-[var(--ink)]">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}
      {recording && (
        <div className="flex items-center gap-2 text-xs text-rose-300">
          <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
          מקליט...
          <button type="button" onClick={cancelRecording} className="text-[var(--text-secondary)] hover:text-[var(--ink)] mr-auto">
            ביטול
          </button>
        </div>
      )}
      <div className="try-glass try-composer">
        {canAttach && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              className="hidden"
              onChange={e => {
                const next = e.target.files?.[0];
                if (next) setFile(next);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              title="צרף קובץ"
              onClick={() => fileRef.current?.click()}
              disabled={sending || recording}
              className="try-icon"
            >
              <PaperclipIcon className="w-5 h-5" />
            </button>
          </>
        )}
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder={file ? 'כיתוב (אופציונלי)...' : 'כתוב הודעה...'}
          disabled={sending || recording}
          className="relative flex-1 min-w-0 bg-transparent px-1.5 py-2.5 text-[16px] text-[var(--ink)] placeholder:text-[var(--text-muted)] outline-none disabled:opacity-50"
        />
        {allowVoice && !text.trim() && !file && !recording && (
          <button
            type="button"
            title="הקלט הודעה קולית"
            onClick={() => void startRecording()}
            disabled={sending}
            className="try-icon"
          >
            <VoiceIcon className="w-5 h-5" />
          </button>
        )}
        {recording ? (
          <button
            type="button"
            onClick={finishRecording}
            className="try-send"
          >
            שלח
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || (!text.trim() && !file)}
            className="try-send"
            aria-label="שלח"
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
            ) : (
              <SendIcon />
            )}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
