// Header-level auto-refresh selector. Visual twin of DateRangeSelector —
// ghost button with icon + interval + caret. Menu behavior is stubbed
// for now (click is a no-op); interval choice and on/off toggle will be
// wired up in a follow-up. The interval label keeps the green
// "active" cue the previous text-based readout used.
import { RefreshCw, ChevronDown } from 'lucide-react';

const INTERVAL_LABEL = '30s';

export function AutoRefreshSelector() {
  return (
    <button
      type="button"
      className="btn ghost"
      aria-label="Auto-refresh"
      aria-haspopup="menu"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
    >
      <RefreshCw size={14} />
      <span
        className="mono"
        style={{ fontSize: 12, color: 'var(--status-ok)' }}
      >
        {INTERVAL_LABEL}
      </span>
      <ChevronDown size={12} style={{ opacity: 0.7 }} />
    </button>
  );
}
