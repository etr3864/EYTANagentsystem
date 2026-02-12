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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-slate-800 rounded-xl shadow-xl ${wide ? 'w-full max-w-2xl' : 'w-full max-w-md'}`}>
        <div className="flex justify-between items-center p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
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
