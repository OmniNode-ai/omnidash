export function MockBadge({ label = "MOCK DATA", className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`mb-2 inline-flex items-center gap-2 rounded border border-yellow-500/40 bg-yellow-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-yellow-400 ${className}`}>
      {label}
    </div>
  );
}




