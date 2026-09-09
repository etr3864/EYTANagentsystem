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
        <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-700/40 rounded-lg px-3 py-2">
          <span className="truncate flex-1">{file.name}</span>
          <button type="button" onClick={() => setFile(null)} className="text-slate-400 hover:text-white">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      )}
      {recording && (
        <div className="flex items-center gap-2 text-xs text-rose-300">
          <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
          מקליט...
          <button type="button" onClick={cancelRecording} className="text-slate-400 hover:text-white mr-auto">
            ביטול
          </button>
        </div>
      )}
      <div className="flex gap-2 items-end">
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
              className="p-2.5 rounded-xl bg-slate-700/50 text-slate-300 hover:text-white disabled:opacity-40"
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
          className="flex-1 px-4 py-2.5 rounded-xl bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
        />
        {allowVoice && !text.trim() && !file && !recording && (
          <button
            type="button"
            title="הקלט הודעה קולית"
            onClick={() => void startRecording()}
            disabled={sending}
            className="p-2.5 rounded-xl bg-slate-700/50 text-slate-300 hover:text-white disabled:opacity-40"
          >
            <VoiceIcon className="w-5 h-5" />
          </button>
        )}
        {recording ? (
          <button
            type="button"
            onClick={finishRecording}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium"
          >
            שלח
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || (!text.trim() && !file)}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-medium flex items-center gap-2"
          >
            {sending ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <SendIcon />
            )}
            <span>שלח</span>
          </button>
        )}
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  );
}
