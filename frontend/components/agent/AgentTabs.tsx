'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export type AgentTabGroup = 'ops' | 'content' | 'auto' | 'system';

export interface AgentTabItem {
  id: string;
  label: string;
  group: AgentTabGroup;
}

const GROUP_ORDER: AgentTabGroup[] = ['ops', 'content', 'auto', 'system'];
const GROUP_LABELS: Record<AgentTabGroup, string> = {
  ops: 'שיחה',
  content: 'תוכן',
  auto: 'אוטומציה',
  system: 'מערכת',
};

interface AgentTabsProps<T extends string> {
  tabs: AgentTabItem[];
  current: T;
  onChange: (id: T) => void;
}

export function AgentTabs<T extends string>({ tabs, current, onChange }: AgentTabsProps<T>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef(new Map<string, HTMLButtonElement>());
  const firstReveal = useRef(true);
  const [pill, setPill] = useState({ x: 0, w: 0 });
  const [ready, setReady] = useState(false);

  const groups = GROUP_ORDER
    .map((id) => ({
      id,
      label: GROUP_LABELS[id],
      items: tabs.filter((tab) => tab.group === id),
    }))
    .filter((group) => group.items.length > 0);

  const placePill = useCallback(() => {
    const inner = innerRef.current;
    const btn = buttonsRef.current.get(current);
    if (!inner || !btn) return;
    const track = inner.getBoundingClientRect();
    const box = btn.getBoundingClientRect();
    setPill({ x: box.left - track.left, w: box.width });
    setReady(true);
  }, [current]);

  const revealActive = useCallback((smooth: boolean) => {
    const scroller = scrollerRef.current;
    const btn = buttonsRef.current.get(current);
    if (!scroller || !btn) return;
    const view = scroller.getBoundingClientRect();
    const box = btn.getBoundingClientRect();
    const pad = 24;
    let dx = 0;
    if (box.right > view.right - pad) dx = box.right - view.right + pad;
    else if (box.left < view.left + pad) dx = box.left - view.left - pad;
    if (dx) scroller.scrollBy({ left: dx, behavior: smooth ? 'smooth' : 'auto' });
  }, [current]);

  useLayoutEffect(() => {
    placePill();
    if (!buttonsRef.current.get(current)) return;
    const smooth = !firstReveal.current;
    firstReveal.current = false;
    revealActive(smooth);
  }, [current, tabs, placePill, revealActive]);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    const scroller = scrollerRef.current;
    if (!inner) return;
    let alive = true;
    const ro = new ResizeObserver(placePill);
    ro.observe(inner);
    if (scroller) ro.observe(scroller);
    window.addEventListener('resize', placePill);
    void document.fonts?.ready.then(() => {
      if (alive) placePill();
    });
    return () => {
      alive = false;
      ro.disconnect();
      window.removeEventListener('resize', placePill);
    };
  }, [placePill]);

  return (
    <nav className="ops-tabs try-glass" role="tablist" aria-label="לשוניות סוכן">
      <div ref={scrollerRef} className="ops-tabs-scroll scrollbar-hide">
        <div ref={innerRef} className="ops-tabs-inner">
          <span
            className={`ops-tabs-pill${ready ? ' is-ready' : ''}`}
            style={{ width: pill.w, transform: `translateX(${pill.x}px)` }}
            aria-hidden
          />
          {groups.map((group, index) => (
            <div key={group.id} role="group" aria-label={group.label} className="ops-tabs-group">
              {index > 0 && <span className="ops-tabs-split" aria-hidden />}
              {group.items.map((item) => {
                const active = current === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    ref={(node) => {
                      if (node) buttonsRef.current.set(item.id, node);
                      else buttonsRef.current.delete(item.id);
                    }}
                    onClick={() => onChange(item.id as T)}
                    className={`ops-tab${active ? ' is-on' : ''}`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}
