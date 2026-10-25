export function BoltMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect width="64" height="64" rx="14" fill="var(--night)" />
      <rect x="1" y="1" width="62" height="62" rx="13" fill="none" stroke="var(--night-ring)" strokeWidth="2" />
      <path d="M36.5 7 15 36h14l-3.5 21L49 27.5H34.8L36.5 7Z" fill="var(--volt)" />
    </svg>
  );
}

export function BoltGlyph({ size = 14, color = "var(--volt)" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13.7 1.5 4.6 13.8h6l-1.5 8.7 9.9-12.6h-6l.7-8.4Z" fill={color} />
    </svg>
  );
}

export function Wordmark({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <BoltMark size={size} />
      <span className="sb-wordmark" style={{ fontSize: size * 0.72 }}>
        swingbus
      </span>
    </span>
  );
}
