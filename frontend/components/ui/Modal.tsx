'use client';

import { XIcon } from './Icons';

interface ModalProps {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  wide?: boolean;
}

export function Modal({ children, onClose, title, wide = false }: ModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`try-glass ${wide ? 'w-full max-w-2xl' : 'w-full max-w-md'} rounded-[26px] overflow-hidden text-[var(--text-primary)]`}>
        <div className="flex justify-between items-center p-4 border-b border-[var(--edge)]">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            <XIcon />
          </button>
        </div>
        <div className="p-4">
          {children}
        </div>
      </div>
    </div>
  );
}
