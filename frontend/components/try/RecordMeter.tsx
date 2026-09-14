'use client';

import { useEffect, useState } from 'react';

const BARS = 7;

export function RecordMeter({ stream }: { stream: MediaStream | null }) {
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.25));

  useEffect(() => {
    if (!stream) return;
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      setLevels(Array.from({ length: BARS }, (_, i) => (data[i + 2] || 0) / 255));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      void ctx.close();
    };
  }, [stream]);

  return (
    <div className="flex items-center gap-[3px] h-7" aria-hidden>
      {levels.map((level, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-white/75 try-wave-bar"
          style={{ height: `${8 + level * 18}px`, animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}
