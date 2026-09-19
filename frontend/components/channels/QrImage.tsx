'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// WaSender help: WhatsApp QR expires every 10–15 seconds.
export const QR_TTL_SECONDS = 15;

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

export function useQrSeconds(qr: string | null | undefined, ttl = QR_TTL_SECONDS): number | null {
  const [left, setLeft] = useState<number | null>(qr ? ttl : null);

  useEffect(() => {
    if (!qr) {
      setLeft(null);
      return;
    }
    setLeft(ttl);
    const started = Date.now();
    const id = window.setInterval(() => {
      setLeft(Math.max(0, ttl - Math.floor((Date.now() - started) / 1000)));
    }, 200);
    return () => window.clearInterval(id);
  }, [qr, ttl]);

  return left;
}
