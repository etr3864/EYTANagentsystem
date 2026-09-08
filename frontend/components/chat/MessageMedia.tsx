'use client';

import type { Message } from '@/lib/types';
import { VoiceIcon, ImageIcon, VideoIcon, FileIcon, DownloadIcon } from '@/components/ui/Icons';

/** Customer-facing text: drop vision / too-large prefixes, keep caption. */
export function bubbleText(msg: Message): string {
  const content = msg.content || '';
  if (msg.media_too_large) {
    return content.replace(/^\[קובץ גדול מדי\]:[^\n]*\n?/, '').trim();
  }
  if (msg.message_type === 'voice') {
    return content.replace(/^\[הודעה קולית\]:\s*/, '');
  }
  if (msg.message_type === 'image' && !msg.media_url) {
    if (content === '[תמונה]') return '';
    return content.replace(/^\[תמונה\]:\s*/, '');
  }
  if ((msg.message_type === 'image' || msg.message_type === 'video') && msg.media_url) {
    const rest = content.replace(/^\[(image|video|תמונה|וידאו)\]:[^\n]*\n?/i, '').trim();
    if (rest === '[תמונה]' || rest === '[וידאו]') return '';
    return rest;
  }
  if (msg.message_type === 'document') {
    const named = content.match(/^\[קובץ:\s*([^\]]*)\]/);
    return named ? named[1].trim() : '';
  }
  return content;
}

interface MessageMediaProps {
  msg: Message;
  displayContent: string;
}

function DownloadLink({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-300 hover:text-blue-200 underline underline-offset-2"
    >
      <DownloadIcon className="w-3.5 h-3.5" />
      {label}
    </a>
  );
}

export function MessageMedia({ msg, displayContent }: MessageMediaProps) {
  const url = msg.media_url;
  const isVoice = msg.message_type === 'voice';
  const isImage = msg.message_type === 'image';
  const isVideo = msg.message_type === 'video';
  const isDocument = msg.message_type === 'document';

  if (msg.media_too_large) {
    return (
      <div className="mb-2 pb-2 border-b border-amber-500/20">
        <div className="flex items-center gap-2 text-amber-300 text-xs mb-2">
          <FileIcon />
          <span>קובץ גדול מדי — לא נשמר בשיחה</span>
        </div>
        {displayContent && (
          <div className="text-xs text-amber-200/80 mb-2 whitespace-pre-wrap">{displayContent}</div>
        )}
        {url ? (
          <>
            <DownloadLink url={url} label="הורד ידנית" />
            <p className="text-[10px] text-amber-400/70 mt-1">
              הלינק זמני — אחרי זמן קצר הוא עלול לפוג
            </p>
          </>
        ) : (
          <p className="text-[10px] text-amber-400/70">אין קישור להורדה לקובץ הזה</p>
        )}
      </div>
    );
  }

  if (isVoice) {
    return (
      <div className="mb-2">
        <div className="flex items-center gap-2 text-purple-400 text-xs mb-2 pb-2 border-b border-purple-500/20">
          <VoiceIcon />
          <span>הודעה קולית</span>
        </div>
        {url && (
          <audio src={url} controls preload="metadata" className="w-full max-w-xs h-10" />
        )}
      </div>
    );
  }

  if (!url && isImage) {
    return (
      <div className="flex items-center gap-2 text-cyan-400 text-xs mb-2 pb-2 border-b border-cyan-500/20">
        <ImageIcon />
        <span>תמונה</span>
      </div>
    );
  }

  if (!url) return null;

  if (isDocument) {
    return (
      <div className="mb-2">
        <div className="flex items-center gap-2 text-amber-400 text-xs mb-2 pb-2 border-b border-amber-500/20">
          <FileIcon />
          <span>קובץ</span>
        </div>
        <DownloadLink url={url} label="פתח / הורד" />
      </div>
    );
  }

  return (
    <div className="mb-2">
      <div className={`flex items-center gap-2 text-xs mb-2 pb-2 border-b ${
        isVideo ? 'text-pink-400 border-pink-500/20' : 'text-indigo-400 border-indigo-500/20'
      }`}>
        {isVideo ? <VideoIcon /> : <ImageIcon />}
        <span>{isVideo ? 'סרטון' : 'תמונה'}</span>
      </div>
      {isImage && (
        <img
          src={url}
          alt={displayContent || 'תמונה'}
          className="max-w-full max-h-64 rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity"
          onClick={() => window.open(url, '_blank')}
        />
      )}
      {isVideo && (
        <video src={url} controls className="max-w-full max-h-64 rounded-lg" preload="metadata" />
      )}
      {displayContent && (
        <div className="text-sm whitespace-pre-wrap leading-relaxed mt-2">{displayContent}</div>
      )}
    </div>
  );
}
