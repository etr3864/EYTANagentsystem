'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const HIDE_PX = 40;
const SHOW_PX = 140;
const STUCK_PX = 72;

function gap(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight;
}

export function useStickToBottom(pinKey: string, lastId: string, lastRole?: string) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stuckRef = useRef(true);
  const jumpingRef = useRef(false);
  const visibleRef = useRef(false);
  const lastIdRef = useRef(lastId);
  const rafRef = useRef(0);
  const [showJump, setShowJump] = useState(false);

  const setVisible = useCallback((next: boolean) => {
    if (visibleRef.current === next) return;
    visibleRef.current = next;
    setShowJump(next);
  }, []);

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const dist = gap(el);
    if (jumpingRef.current) {
      if (dist <= HIDE_PX) jumpingRef.current = false;
      stuckRef.current = true;
      setVisible(false);
      return;
    }
    stuckRef.current = dist <= STUCK_PX;
    if (visibleRef.current) {
      if (dist < HIDE_PX) setVisible(false);
    } else if (dist > SHOW_PX) {
      setVisible(true);
    }
  }, [setVisible]);

  const onScroll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(measure);
  }, [measure]);

  const pinNow = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setVisible(false);
  }, [setVisible]);

  const jumpToLatest = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    stuckRef.current = true;
    jumpingRef.current = true;
    setVisible(false);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [setVisible]);

  const onPointerDown = useCallback(() => {
    if (!jumpingRef.current) return;
    jumpingRef.current = false;
    measure();
  }, [measure]);

  useEffect(() => {
    const newUserMsg = lastRole === 'user' && lastId !== lastIdRef.current;
    lastIdRef.current = lastId;
    if (newUserMsg) stuckRef.current = true;
    const id = requestAnimationFrame(() => {
      if (stuckRef.current) pinNow();
      else measure();
    });
    return () => cancelAnimationFrame(id);
  }, [pinKey, lastId, lastRole, pinNow, measure]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const ro = new ResizeObserver(() => {
      if (stuckRef.current) pinNow();
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [pinNow]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return { scrollerRef, contentRef, showJump, onScroll, onPointerDown, jumpToLatest };
}
