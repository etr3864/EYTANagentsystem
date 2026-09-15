'use client';

import { useEffect, useState } from 'react';
import { Orb } from './Orb';

const STEPS = ['מאמת את הקישור', 'מתחבר לסוכן', 'טוען את ההקשר שלך', 'כמעט שם'];

export function Connecting({
  title,
  live = false,
}: {
  title: string;
  live?: boolean;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      setStep((n) => (n + 1) % STEPS.length);
    }, 700);
    return () => window.clearInterval(id);
  }, [live]);

  return (
    <div className="relative flex-1 flex flex-col items-center justify-center gap-7 px-6 pb-16">
      <Orb size={72} bob />
      <div className="text-center">
        <div className="text-[22px] font-bold mb-2">{title}</div>
        {live ? <div className="text-[14px] text-[color:var(--ink-dim)]">{STEPS[step]}</div> : null}
      </div>
      {live && (
        <div className="try-progress">
          <span />
        </div>
      )}
    </div>
  );
}
