import { isTodayInProgress } from './DayAxis';
/**
 * OMN-22168 AC3: the Overview's paid-against-all-cloud day chart. Moved from src/pages/local/insight-charts.tsx with the
 * markup unchanged. Per UTC day: the paid bar, the saved bar beside it and the all-cloud baseline as a mark; a value
 * not served draws nothing and is said in words under the day.
 */
export interface SpendDay {
  key: string; ariaLabel: string; dayText: string; valuesText: string;
  spend: number | null; saved: number | null; baseline: number | null;
}

/** One cumulative-savings column: its running total (null when not available) and the words for its day. */
export interface CumulativeDay { key: string; value: number | null; ariaLabel: string }

/**
 * The Overview's cumulative savings by UTC day, moved from src/pages/local/insight-charts.tsx with the markup unchanged.
 * A day whose total is not available draws no height; each column says its day and total in words.
 */
export function CumulativeColumns({ label, days, max, onHover }: { label: string; days: readonly CumulativeDay[]; max: number; onHover: (index: number | null) => void }) {
  return (
    <div className="ins-bars ins-bars--short" role="group" aria-label={label} onMouseLeave={() => onHover(null)}>
      {days.map((day, index) => <button key={day.key} type="button" className="ins-bar" aria-label={day.ariaLabel} data-day={day.key} data-in-progress={isTodayInProgress(day.key) ? 'true' : undefined} onMouseEnter={() => onHover(index)} onFocus={() => onHover(index)}>
        <span className="ins-seg od-grow" style={{ height: `${day.value === null ? 0 : day.value / max * 100}%`, background: 'var(--ds-chart-3)' }} />
      </button>)}
    </div>
  );
}

export function SpendColumns({ label, days, max, onHover }: { label: string; days: readonly SpendDay[]; max: number; onHover: (index: number | null) => void }) {
  return (
    <>
      <div className="ins-money-bars" role="group" aria-label={label} onMouseLeave={() => onHover(null)}>
        {days.map((day, index) => <button key={day.key} type="button" className="ins-money-day" aria-label={day.ariaLabel} data-day={day.key} data-in-progress={isTodayInProgress(day.key) ? 'true' : undefined} onMouseEnter={() => onHover(index)} onFocus={() => onHover(index)}>
          <span className="ins-money-day-bars">
            {day.spend !== null && <span className="ins-money-paid" style={{ height: `${day.spend / max * 100}%` }} />}
            {day.saved !== null && <span className="ins-money-saved" style={{ height: `${day.saved / max * 100}%` }} />}
            {day.baseline !== null && <span className="ins-money-baseline" style={{ bottom: `${day.baseline / max * 100}%` }} />}
          </span>
          <span>{day.dayText}</span>
          <span className="ins-money-values">{day.valuesText}</span>
        </button>)}
      </div>
      <div className="ins-money-legend"><span data-tone="paid">Paid</span><span data-tone="saved">Saved</span><span data-tone="baseline">All-cloud baseline</span></div>
    </>
  );
}
