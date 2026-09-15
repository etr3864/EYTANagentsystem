export function TypingBubble({ label }: { label?: string | null }) {
  return (
    <div className="flex justify-start try-drop">
      <div className="try-bubble try-bubble-agent is-tailed flex items-center gap-2.5">
        <span className="try-eq" aria-hidden>
          <i /><i /><i /><i />
        </span>
        <span className="relative text-[12px] text-[color:var(--ink-dim)]">
          {label ? `${label}…` : 'מקליד…'}
        </span>
      </div>
    </div>
  );
}
