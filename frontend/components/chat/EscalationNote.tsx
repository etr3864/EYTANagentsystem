export function EscalationNote({ content }: { content: string }) {
  return (
    <>
      <div className="flex items-center gap-2 text-rose-300 text-xs mb-2 pb-2 border-b border-rose-500/20">
        <span>אסקלציה פנימית · הלקוח לא רואה</span>
      </div>
      <div className="text-sm whitespace-pre-wrap leading-relaxed">{content}</div>
    </>
  );
}
