import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { formatFullCount } from '@/lib/dashboard-count';
import type { DailyMeteringTokenData } from '@/lib/daily-metering-tokens';
import { TokenDirections } from './TokenDirections';

const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Exact served daily totals, separately labelled when no model series is available. */
export function DailyMeteringTokens({ data }: { data: DailyMeteringTokenData }) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  if (data.days.length === 0) return <p className="local-dashboard-empty">{data.reason}</p>;
  const lastPage = Math.floor((data.days.length - 1) / 7);
  const currentPage = Math.min(page, lastPage);
  const end = data.days.length - currentPage * 7;
  const start = Math.max(0, end - 7);
  const days = data.days.slice(start, end);
  const active = days.find(day => day.day === selected) ?? days[days.length - 1];
  const total = (input: string | null, output: string | null) => BigInt(input ?? 0) + BigInt(output ?? 0);
  const maximum = data.days.reduce((max, day) => { const n = total(day.input, day.output); return n > max ? n : max; }, 0n);
  const height = (value: string | null) => maximum === 0n || value === null ? 0 : Number(BigInt(value) * 16000n / maximum) / 100;
  const stamp = active.asOf === null ? 'Update time not recorded' : `${new Date(active.asOf).toISOString().slice(0, 19).replace('T', ' ')} UTC`;
  const direction = (value: string | null) => value === null ? 'not recorded' : formatFullCount(value);
  return <figure aria-label="Daily metering token totals" className="daily-metering-tokens">
    <figcaption><span>Daily metering totals · UTC</span><span>Model breakdown unavailable</span></figcaption>
    <div className="daily-metering-bars" role="group" aria-label="Daily metering tokens">
      {days.map(day => <button type="button" key={day.day}
        aria-label={`${dayLabel(day.day)}: ${direction(day.input)} in, ${direction(day.output)} out`}
        onFocus={() => setSelected(day.day)} onMouseEnter={() => setSelected(day.day)} onClick={() => setSelected(day.day)}>
        <span className="daily-metering-stack" aria-hidden="true">
          {day.output !== null && <span data-field-tone="tokens-out" style={{ height: `${height(day.output)}px`, minHeight: BigInt(day.output) > 0n ? 2 : 0 }} />}
          {day.input !== null && <span data-field-tone="tokens-in" style={{ height: `${height(day.input)}px`, minHeight: BigInt(day.input) > 0n ? 2 : 0 }} />}
        </span><span>{dayLabel(day.day)}</span>
      </button>)}
    </div>
    <div role="status" className="daily-metering-readout">
      <strong>{dayLabel(active.day)}</strong><TokenDirections input={active.input} output={active.output} />
      <span>{stamp}</span>
      {active.unknownTokenRuns === null ? <span>Token coverage not recorded</span>
        : BigInt(active.unknownTokenRuns) > 0n && <span>{formatFullCount(active.unknownTokenRuns)} runs with unrecorded tokens</span>}
    </div>
    {data.days.length > 7 && <nav className="daily-metering-pager" aria-label="Token days">
      <button type="button" aria-label="Previous token days" disabled={currentPage === lastPage} onClick={() => { setPage(currentPage + 1); setSelected(null); }}><ChevronLeft size={16} /></button>
      <span>{dayLabel(days[0].day)} – {dayLabel(days[days.length - 1].day)}</span>
      <button type="button" aria-label="Next token days" disabled={currentPage === 0} onClick={() => { setPage(Math.max(0, currentPage - 1)); setSelected(null); }}><ChevronRight size={16} /></button>
    </nav>}
  </figure>;
}
