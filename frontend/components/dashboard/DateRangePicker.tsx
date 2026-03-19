'use client';

import { useState, useRef, useEffect } from 'react';

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmt(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isBetween(d: Date, start: Date, end: Date) {
  return d >= start && d <= end;
}

function getMonthDays(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const startPad = first.getDay(); // 0=Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}

function formatLabel(from: string, to: string): string {
  if (!from || !to) return 'בחר תאריכים';
  const f = new Date(from);
  const t = new Date(to);
  const fmtHe = (d: Date) => `${d.getDate()} ב${hebrewMonth(d.getMonth())} ${d.getFullYear()}`;
  if (isSameDay(f, t)) return fmtHe(f);
  return `מ-${fmtHe(f)} עד ${fmtHe(t)}`;
}

const MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
function hebrewMonth(m: number) { return MONTHS_HE[m]; }

function MonthGrid({
  year, month, rangeStart, rangeEnd, selecting, onDayClick, today,
}: {
  year: number; month: number;
  rangeStart: Date | null; rangeEnd: Date | null;
  selecting: boolean;
  onDayClick: (d: Date) => void;
  today: Date;
}) {
  const cells = getMonthDays(year, month);

  return (
    <div className="w-[280px]">
      <div className="text-center text-sm font-semibold text-white mb-3">
        {hebrewMonth(month)} {year}
      </div>
      <div className="grid grid-cols-7 gap-0">
        {DAY_NAMES.map((n) => (
          <div key={n} className="text-center text-xs text-slate-500 py-1">{n}</div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={`e-${i}`} />;

          const isToday = isSameDay(cell, today);
          const isStart = rangeStart && isSameDay(cell, rangeStart);
          const isEnd = rangeEnd && isSameDay(cell, rangeEnd);
          const inRange = rangeStart && rangeEnd && isBetween(cell, rangeStart, rangeEnd);
          const isFuture = cell > today;

          let bg = '';
          if (isStart || isEnd) bg = 'bg-purple-600 text-white rounded-full';
          else if (inRange) bg = 'bg-purple-600/20 text-purple-300';

          return (
            <button
              key={fmt(cell)}
              disabled={isFuture}
              onClick={() => onDayClick(cell)}
              className={`
                h-9 w-full text-sm text-center transition-colors
                ${isFuture ? 'text-slate-700 cursor-not-allowed' : 'hover:bg-slate-600/50 cursor-pointer'}
                ${isToday && !isStart && !isEnd ? 'font-bold text-purple-400' : ''}
                ${bg}
                ${!bg && !isFuture ? 'text-slate-300' : ''}
              `}
            >
              {cell.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    const d = to ? new Date(to) : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selecting, setSelecting] = useState(false);
  const [tempStart, setTempStart] = useState<Date | null>(from ? new Date(from) : null);
  const [tempEnd, setTempEnd] = useState<Date | null>(to ? new Date(to) : null);
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDropUp(spaceBelow < 420);
  }, [open]);

  const prevMonth = viewDate.month === 0
    ? { year: viewDate.year - 1, month: 11 }
    : { year: viewDate.year, month: viewDate.month - 1 };

  function handleDayClick(d: Date) {
    if (!selecting || !tempStart) {
      setTempStart(d);
      setTempEnd(null);
      setSelecting(true);
    } else {
      const [start, end] = d < tempStart ? [d, tempStart] : [tempStart, d];
      setTempStart(start);
      setTempEnd(end);
      setSelecting(false);
      onChange(fmt(start), fmt(end));
      setOpen(false);
    }
  }

  function goBack() {
    setViewDate((v) => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 });
  }

  function goForward() {
    const nextMonth = viewDate.month === 11 ? { year: viewDate.year + 1, month: 0 } : { year: viewDate.year, month: viewDate.month + 1 };
    const now = new Date();
    if (nextMonth.year > now.getFullYear() || (nextMonth.year === now.getFullYear() && nextMonth.month > now.getMonth())) return;
    setViewDate(nextMonth);
  }

  return (
    <div className="relative" ref={ref} dir="rtl">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-white/5 border border-purple-500/10 rounded-lg px-3 py-1.5 text-sm text-white hover:border-purple-500/20 transition-colors"
      >
        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="text-slate-300">{formatLabel(from, to)}</span>
      </button>

      {open && (
        <div
          ref={popupRef}
          className={`
            absolute z-50 bg-[#0F0B1F] border border-purple-500/15 rounded-xl shadow-2xl p-4
            right-0 md:right-auto md:left-0
            ${dropUp ? 'bottom-full mb-2' : 'top-full mt-2'}
          `}
          style={{ maxWidth: 'calc(100vw - 24px)' }}
        >
          <div className="flex items-center justify-between mb-2 px-1">
            <button onClick={goForward} className="p-1 rounded hover:bg-white/10 text-slate-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={goBack} className="p-1 rounded hover:bg-white/10 text-slate-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <div className="flex flex-col md:flex-row gap-4 md:gap-6 overflow-x-auto" dir="rtl">
            <MonthGrid
              year={viewDate.year} month={viewDate.month}
              rangeStart={tempStart} rangeEnd={tempEnd}
              selecting={selecting} onDayClick={handleDayClick} today={today}
            />
            <MonthGrid
              year={prevMonth.year} month={prevMonth.month}
              rangeStart={tempStart} rangeEnd={tempEnd}
              selecting={selecting} onDayClick={handleDayClick} today={today}
            />
          </div>
        </div>
      )}
    </div>
  );
}
