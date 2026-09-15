export function Orb({
  size,
  bob = false,
  ornate = false,
  className,
}: {
  size?: number;
  bob?: boolean;
  ornate?: boolean;
  className?: string;
}) {
  return (
    <div
      className={['try-orb', className].filter(Boolean).join(' ')}
      style={{
        ...(size != null ? { width: size, height: size } : {}),
        animation: bob ? 'try-bob 3s ease-in-out infinite' : undefined,
      }}
      aria-hidden
    >
      <span className="try-orb-sheen" />
      {ornate && <span className="try-orb-ring" />}
      <span className="try-orb-core" />
      {ornate && <span className="try-orb-spark" />}
      <span className="try-orb-gloss" />
    </div>
  );
}
