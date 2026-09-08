'use client';

import { useState } from 'react';
import { Button, Input, Modal } from '@/components/ui';

interface TitleDialogProps {
  heading: string;
  hint?: string;
  defaultValue: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (title: string) => void;
}

export function TitleDialog({
  heading,
  hint,
  defaultValue,
  confirmLabel,
  onCancel,
  onConfirm,
}: TitleDialogProps) {
  const [title, setTitle] = useState(defaultValue);
  const trimmed = title.trim();

  return (
    <Modal title={heading} onClose={onCancel}>
      <div className="space-y-4">
        <Input
          label="כותרת"
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && trimmed) onConfirm(trimmed);
          }}
          hint={hint}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>ביטול</Button>
          <Button disabled={!trimmed} onClick={() => onConfirm(trimmed)}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}