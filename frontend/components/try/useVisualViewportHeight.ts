'use client';

import { useEffect, useState } from 'react';

type ViewportFrame = {
  height: number;
  offsetTop: number;
  keyboard: boolean;
};

/** Pins the chat to the visible web viewport so the keyboard does not shove it off-screen. */
export function useVisualViewportHeight(): ViewportFrame | null {
  const [frame, setFrame] = useState<ViewportFrame | null>(null);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlHeight: html.style.height,
      bodyHeight: body.style.height,
    };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.overflowX = 'hidden';
    body.style.overflowX = 'hidden';
    html.style.height = '100%';
    body.style.height = '100%';

    const apply = () => {
      const vp = window.visualViewport;
      const height = vp?.height ?? window.innerHeight;
      const offsetTop = vp?.offsetTop ?? 0;
      setFrame({
        height,
        offsetTop,
        keyboard: Boolean(vp && window.innerHeight - vp.height > 80),
      });
      if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
    };

    apply();
    const vp = window.visualViewport;
    vp?.addEventListener('resize', apply);
    vp?.addEventListener('scroll', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      html.style.height = prev.htmlHeight;
      body.style.height = prev.bodyHeight;
      vp?.removeEventListener('resize', apply);
      vp?.removeEventListener('scroll', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, []);

  return frame;
}
