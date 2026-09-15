'use client';

import { useEffect } from 'react';

export function Atmosphere() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const root = document.querySelector('.try-root') as HTMLElement | null;
        if (!root) return;
        root.style.setProperty('--mx', `${e.clientX + w * 0.06}px`);
        root.style.setProperty('--my', `${e.clientY + h * 0.06}px`);
        root.style.setProperty('--px', `${((e.clientX / w - 0.5) * -22).toFixed(1)}px`);
        root.style.setProperty('--py', `${((e.clientY / h - 0.5) * -22).toFixed(1)}px`);
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      <div
        className="try-atmo-blobs absolute inset-0"
        style={{
          background:
            'radial-gradient(85% 60% at 20% 6%, oklch(0.34 0.08 296 / 0.58), transparent 62%), radial-gradient(80% 60% at 86% 94%, oklch(0.27 0.07 300 / 0.62), transparent 64%), radial-gradient(60% 45% at 62% 46%, oklch(0.22 0.055 298 / 0.48), transparent 70%)',
        }}
      />
      <div
        className="absolute opacity-90"
        style={{
          inset: '-6%',
          transform: 'translate3d(var(--px), var(--py), 0)',
          transition: 'transform 900ms cubic-bezier(.2,.8,.2,1)',
        }}
      >
        <svg viewBox="0 0 1000 1000" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" fill="none" stroke="currentColor" className="text-[var(--ink)] opacity-[0.42]">
          <g strokeWidth="1.3" strokeLinecap="round" id="try-netlines">
            <path d="M84 138 L213 97 L361 186 L268 289 L84 138 M213 97 L306 41 L470 92 L361 186 M470 92 L612 47 L744 129 L636 214 L470 92 M744 129 L889 96 L957 213 L846 268 L744 129 M636 214 L846 268 M361 186 L492 268 L636 214 M268 289 L399 372 L492 268 M399 372 L556 341 L492 268 M556 341 L700 397 L846 268 M700 397 L812 492 L957 447 M812 492 L723 601 L700 397 M723 601 L861 664 L957 561 M723 601 L588 656 L533 528 L723 601 M533 528 L399 372 M533 528 L372 594 L241 497 L399 372 M241 497 L96 441 L84 138 M241 497 L188 651 L332 719 L372 594 M332 719 L588 656 M332 719 L286 861 L441 915 L559 812 L588 656 M441 915 L629 941 L559 812 M629 941 L788 889 L861 664 M559 812 L788 889 M188 651 L96 441 M96 441 L268 289 M812 492 L957 447 L889 96 M286 861 L188 651" />
          </g>
          <g fill="var(--acc)" stroke="none">
            <circle cx="846" cy="268" r="2.6" style={{ animation: 'try-fire 6s linear infinite' }} />
            <circle cx="588" cy="656" r="2.6" style={{ animation: 'try-fire 7s linear infinite 2.2s' }} />
            <circle cx="399" cy="372" r="2.6" style={{ animation: 'try-fire 7.5s linear infinite 3.4s' }} />
          </g>
          <g stroke="var(--acc)" strokeWidth="2" strokeLinecap="round" opacity="0.95" strokeDasharray="40 626" pathLength={666}>
            <path d="M84 138 L361 186 L492 268 L399 372 L533 528 L723 601 L846 268" style={{ animation: 'try-zap 6s linear infinite' }} />
            <path d="M399 372 L241 497 L188 651 L332 719 L588 656" style={{ animation: 'try-zap 7s linear infinite 2.2s' }} />
          </g>
          <g fill="currentColor" stroke="none">
            <circle cx="361" cy="186" r="3.4" /><circle cx="399" cy="372" r="4" />
            <circle cx="723" cy="601" r="3.6" /><circle cx="846" cy="268" r="3.2" />
            <circle cx="492" cy="268" r="3.4" /><circle cx="588" cy="656" r="3" />
            <circle cx="241" cy="497" r="3" /><circle cx="332" cy="719" r="3" />
          </g>
        </svg>
      </div>
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle 340px at var(--mx) var(--my), oklch(0.80 0.125 225 / 0.10), transparent 70%)',
          transition: 'background 300ms linear',
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.34]"
        style={{
          backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.95) 0.6px, transparent 1.3px)',
          backgroundSize: '6px 6px',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          boxShadow: 'inset 0 0 260px 80px var(--bg), inset 0 0 70px 0 rgba(0,0,0,0.45)',
        }}
      />
    </div>
  );
}
