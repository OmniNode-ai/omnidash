import { ArrowDown, ArrowUp } from '@/theme/design-system/icons';
import { formatDashboardCount, formatFullCount, wholeCount } from '@/lib/dashboard-count';

/** One display for directional counts: short by the dashboard count rule (OMN-22168), the exact count on focus and hover. */
export function TokenDirections({ input, output }: { input: unknown; output: unknown }) {
  return <div className="local-token-directions">
    {([[input, 'Input', 'tokens-in', ArrowDown], [output, 'Output', 'tokens-out', ArrowUp]] as const).map(([value, label, tone, Icon]) => {
      const count = wholeCount(value);
      const text = count === null ? 'Not measured' : formatFullCount(count.toString());
      const short = count === null ? 'Not measured' : formatDashboardCount(count.toString());
      // OMN-23330 (identity census, WCAG 2.5.3 label in name): the name starts with the figure as drawn, then the exact count.
      const name = short === text ? `${label} tokens: ${text}` : `${label} tokens: ${short}, exactly ${text}`;
      return <span key={tone} className="local-token-direction" data-field-tone={tone} data-field-unavailable={count === null}
        tabIndex={0} aria-label={name} title={`${label} tokens: ${text}`}>
        <Icon size={15} aria-hidden="true" /><strong>{short}</strong>
      </span>;
    })}
  </div>;
}
