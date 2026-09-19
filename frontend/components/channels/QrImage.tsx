'use client';

import { useEffect, useState } from 'react';

function asImageSrc(qr: string): string | null {
  if (qr.startsWith('data:') || qr.startsWith('http')) return qr;
  if (qr.startsWith('iVBOR') || qr.startsWith('/9j')) return `data:image/png;base64,${qr}`;
  return null;
}

export function QrImage({ value, className }: { value: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(asImageSrc(value));

  useEffect(() => {
    const ready = asImageSrc(value);
    if (ready) {
      setSrc(ready);
      return;
    }
    let cancelled = false;
    import('qrcode')
      .then((mod) => {
        const toDataURL = mod.toDataURL || mod.default?.toDataURL;
        if (!toDataURL) throw new Error('qrcode_missing');
        return toDataURL(value, { width: 320, margin: 1, errorCorrectionLevel: 'M' });
      })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!src) return <div className={`${className || ''} bg-white`} />;
  return <img src={src} alt="QR" className={className} />;
}
