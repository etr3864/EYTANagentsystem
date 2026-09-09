'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Composer, type TemplateSendPayload } from './Composer';
import type { WhatsAppInbox } from '@/lib/api/conversations';
import { startWhatsAppChat } from '@/lib/api/conversations';

interface NewChatModalProps {
  agentId: number;
  inbox: WhatsAppInbox;
  onClose: () => void;
  onOpened: (conversationId: number) => Promise<void> | void;
}

export function NewChatModal({ agentId, inbox, onClose, onOpened }: NewChatModalProps) {
  const [phone, setPhone] = useState('');
  const [mode, setMode] = useState<'freeform' | 'template'>(
    inbox.channel_type === 'whatsapp_meta' ? 'template' : 'freeform',
  );
  const isMeta = inbox.channel_type === 'whatsapp_meta';
  const canChat = Boolean(inbox.channel_type);

  async function send(payload: {
    text?: string;
    file?: File;
    caption?: string;
    asVoice?: boolean;
    templateId?: number;
    bodyParams?: string[];
    headerFile?: File;
  }) {
    const result = await startWhatsAppChat({ agentId, phone, ...payload });
    await onOpened(result.conversation_id);
  }

  return (
    <Modal title="צ׳אט חדש" onClose={onClose} wide>
      {!canChat ? (
        <p className="text-sm text-amber-300">אין ערוץ וואטסאפ פעיל לסוכן הזה.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">וואטסאפ בלבד. הזן מספר ושלח הודעה.</p>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="052-0000000 או 972..."
            dir="ltr"
            className="w-full px-4 py-2.5 rounded-xl bg-slate-700/50 border border-slate-600/50 text-white placeholder-slate-400 text-left"
          />
          {phone.trim() ? (
            <Composer
              mode={mode}
              templates={inbox.templates}
              allowVoice
              allowImages
              allowFiles
              allowSwitchToFreeform={isMeta}
              onSwitchToFreeform={() => setMode('freeform')}
              onSwitchToTemplate={isMeta ? () => setMode('template') : undefined}
              onSendText={text => send({ text })}
              onSendMedia={(file, caption, asVoice) => send({ file, caption, asVoice })}
              onSendVoice={blob => send({
                file: new File([blob], 'voice.webm', { type: blob.type || 'audio/webm' }),
                asVoice: true,
              })}
              onSendTemplate={(p: TemplateSendPayload) => send({
                templateId: p.templateId,
                bodyParams: p.bodyParams,
                headerFile: p.headerFile,
              })}
            />
          ) : (
            <p className="text-xs text-slate-500">הזן מספר כדי להמשיך</p>
          )}
        </div>
      )}
    </Modal>
  );
}
