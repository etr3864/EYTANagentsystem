'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

function asImageSrc(qr: string): string | null {
  if (qr.startsWith('data:image/')) return qr;
  if (qr.startsWith('iVBOR') || qr.startsWith('/9j')) return `data:image/png;base64,${qr}`;
  return null;
}

export function QrImage({ value, className }: { value: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    const ready = asImageSrc(value);
    if (ready) {
      setSrc(ready);
      return () => {
        cancelled = true;
      };
    }
    QRCode.toDataURL(value, { width: 320, margin: 1, errorCorrectionLevel: 'M' })
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

  if (!src) {
    return <div className={`${className || ''} bg-white animate-pulse`} aria-hidden />;
  }
  return (
    <img
      src={src}
      alt="QR"
      className={className}
      onError={() => setSrc(null)}
    />
  );
}

export function useElapsedSeconds(key: string | null): number | null {
  const [elapsed, setElapsed] = useState<number | null>(key ? 0 : null);

  useEffect(() => {
    if (!key) {
      setElapsed(null);
      return;
    }
    setElapsed(0);
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 200);
    return () => window.clearInterval(id);
  }, [key]);

  return elapsed;
}
