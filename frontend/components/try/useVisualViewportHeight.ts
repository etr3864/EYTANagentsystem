'use client';

import { useEffect, useState } from 'react';

/** Keeps the chat frame inside the visible viewport when the mobile keyboard opens. */
export function useVisualViewportHeight() {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const apply = () => {
      const next = window.visualViewport?.height ?? window.innerHeight;
      setHeight(next);
    };
    apply();
    const vp = window.visualViewport;
    vp?.addEventListener('resize', apply);
    vp?.addEventListener('scroll', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      vp?.removeEventListener('resize', apply);
      vp?.removeEventListener('scroll', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, []);

  return height;
}
