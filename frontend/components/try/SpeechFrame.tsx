'use client';

import type { CSSProperties, ReactNode } from 'react';

export function SpeechFrame({
  mine,
  tailed,
  style,
  children,
}: {
  mine: boolean;
  tailed: boolean;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      className={`try-speech ${mine ? 'try-speech-mine' : 'try-speech-agent'}${tailed ? ' is-tailed' : ''}`}
      style={style}
    >
      <div className="try-speech-body">{children}</div>
      {tailed ? <span className="try-speech-nub" aria-hidden /> : null}
    </div>
  );
}
