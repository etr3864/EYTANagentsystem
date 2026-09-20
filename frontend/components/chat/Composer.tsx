'use client';

import { useState } from 'react';
import type { WhatsAppTemplate } from '@/lib/types';
import { FreeformComposer } from './FreeformComposer';
import { TemplateComposer, type TemplateSendPayload } from './TemplateComposer';

export type { TemplateSendPayload };

interface ComposerProps {
  mode: 'freeform' | 'template';
  templates?: WhatsAppTemplate[];
  allowVoice?: boolean;
  allowImages?: boolean;
  allowFiles?: boolean;
  allowSwitchToFreeform?: boolean;
  quoteText?: string | null;
  onCancelQuote?: () => void;
  onSwitchToFreeform?: () => void;
  onSwitchToTemplate?: () => void;
  onSendText: (text: string) => Promise<void>;
  onSendMedia: (file: File, caption: string, asVoice?: boolean) => Promise<void>;
  onSendVoice: (blob: Blob) => Promise<void>;
  onSendTemplate: (payload: TemplateSendPayload) => Promise<void>;
}

export function Composer({
  mode,
  templates = [],
  allowVoice = false,
  allowImages = false,
  allowFiles = false,
  allowSwitchToFreeform = false,
  quoteText = null,
  onCancelQuote,
  onSwitchToFreeform,
  onSwitchToTemplate,
  onSendText,
  onSendMedia,
  onSendVoice,
  onSendTemplate,
}: ComposerProps) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="p-3 border-t border-[var(--edge)] space-y-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      {mode === 'template' && onSwitchToFreeform && allowSwitchToFreeform && (
        <button
          type="button"
          onClick={onSwitchToFreeform}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--ink)]"
        >
          הלקוח כתב ב-24 השעות האחרונות? שלח הודעה רגילה
        </button>
      )}
      {mode === 'freeform' && onSwitchToTemplate && (
        <button
          type="button"
          onClick={onSwitchToTemplate}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--ink)]"
        >
          שלח תבנית במקום
        </button>
      )}
      {mode === 'template' ? (
        <TemplateComposer
          templates={templates}
          onSend={onSendTemplate}
          error={error}
          setError={setError}
        />
      ) : (
        <FreeformComposer
          allowVoice={allowVoice}
          allowImages={allowImages}
          allowFiles={allowFiles}
          quoteText={quoteText}
          onCancelQuote={onCancelQuote}
          onSendText={onSendText}
          onSendMedia={onSendMedia}
          onSendVoice={onSendVoice}
          error={error}
          setError={setError}
        />
      )}
    </div>
  );
}
