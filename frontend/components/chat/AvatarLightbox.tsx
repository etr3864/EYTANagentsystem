'use client';

import { useEffect } from 'react';

interface Props {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function AvatarLightbox({ src, alt = '', onClose }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <button
      type="button"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
      aria-label="סגור תמונה"
    >
      <img
        src={src}
        alt={alt}
        className="max-h-[88vh] max-w-[88vw] rounded-[28px] object-contain shadow-2xl"
      />
    </button>
  );
}
