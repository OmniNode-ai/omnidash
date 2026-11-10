/**
 * OMN-19993: the `status_grid` widget kind, ported as a visual pattern from the
 * archived dashboard (its data-source health list and status tile grid), not
 * from its renderer code.
 *
 * Each tile shows its status as a colored left edge plus the upstream word and
 * the severity's own word and icon, never color alone; a screenshot with the
 * color removed still tells every severity apart. Every tile says why it is in
 * its state: a row with no reason is refused, counted and named, not drawn.
 * With no rows, the empty state names the topic it waits on.
 *
 * The grid maps an upstream verdict to presentation. It never computes one.
 */
import { readableTime } from '@/lib/format';
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { validateStatusGridRow, type StatusGridRow } from '@shared/types/component-manifest';
import { SEVERITY_ORDER, SEVERITY_ROLES, SeverityIcon } from './severity';
// OMN-23330 AC25: this file's fixed inline styles are classes in StatusGrid.static.css.
import './StatusGrid.static.css';

export interface StatusGridProps {
  title: string;
  rows: readonly StatusGridRow[];
  /** The manifest's emptyState.waits_on: the topic(s) the grid waits on. */
  waitsOn: readonly string[];
  isLoading?: boolean;
  error?: Error | null;
  /** True when the rows are fixtures; shows the wrapper's fixture badge. */
  fileMode?: boolean;
  columns?: number;
  /** Optional presentation label; the upstream status remains machine-readable. */
  statusLabel?: (row: StatusGridRow) => string;
}

export function waitingForMessage(waitsOn: readonly string[]): string {
  return `Waiting for ${waitsOn.join(', ')} events`;
}

export function StatusGrid({ title, rows, waitsOn, isLoading, error, fileMode, columns = 3, statusLabel }: StatusGridProps) {
  const shown: StatusGridRow[] = [];
  const refused: string[] = [];
  for (const row of rows) {
    const result = validateStatusGridRow(row);
    if (result.valid) shown.push(row);
    else refused.push(`${row.key || '(no key)'}: ${result.errors.join('; ')}`);
  }

  const counts = SEVERITY_ORDER.map((severity) => ({
    severity,
    n: shown.filter((r) => r.severity === severity).length,
  })).filter((c) => c.n > 0);

  return (
    <ComponentWrapper
      title={title}
      isLoading={isLoading}
      error={error}
      isEmpty={!isLoading && !error && rows.length === 0}
      emptyMessage={waitingForMessage(waitsOn)}
      emptyHint="No row has arrived on this topic yet. A service that is declared but stopped shows DOWN once its first event lands."
      fileMode={fileMode}
    >
      <div
        role="list"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 8 }}
      >
        {shown.map((row) => {
          const role = SEVERITY_ROLES[row.severity];
          return (
            <div
              key={row.key}
              role="listitem"
              data-testid="status-grid-tile"
              data-status={row.status}
              data-severity={row.severity}
              style={{
                borderLeft: `4px solid ${role.edge}`,
                background: 'var(--ds-surface-2)',
                borderRadius: 6,
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                minWidth: 0,
              }}
            >
              <Text className="status-grid-sfecfda" size="sm" weight="semibold" color="primary">
                {row.label}
              </Text>
              <span className="status-grid-s23b34f">
                <Text className="status-grid-sd87841" size="xs" color={role.textColor}>
                  <SeverityIcon severity={row.severity} />
                </Text>
                {/* A class for pages that draw the served status as their status pill (Settings, OMN-22168). */}
                <Text size="xs" weight="bold" color="primary" className="status-grid-status">
                  {statusLabel ? statusLabel(row) : row.status}
                </Text>
                <Text size="xs" color="secondary">
                  {role.label}
                </Text>
              </span>
              <Text className="status-grid-sfecfda" size="xs" color="secondary">
                {row.status_reason}
              </Text>
              {/* OMN-21166 AC60/AC62: a status reads in the text face, its time as "Oct 25, 11:24:36 UTC"; the
                  served timestamp stays in the title. */}
              <Text size="xs" color="tertiary" title={row.last_seen || undefined}>
                {row.last_seen ? `last seen ${readableTime(row.last_seen) ?? row.last_seen}` : 'never seen'}
              </Text>
            </div>
          );
        })}
      </div>
      {counts.length > 0 ? (
        <div className="status-grid-s36ca0a" data-testid="status-grid-summary">
          <Text size="xs" color="tertiary">
            {counts.map((c) => `${c.n} ${SEVERITY_ROLES[c.severity].label.toLowerCase()}`).join(' · ')}
          </Text>
        </div>
      ) : null}
      {refused.length > 0 ? (
        <div className="status-grid-s082f6e" data-testid="status-grid-refused">
          <Text size="xs" family="mono" color="warn">
            {`${refused.length} row${refused.length === 1 ? '' : 's'} refused: ${refused.join(' | ')}`}
          </Text>
        </div>
      ) : null}
    </ComponentWrapper>
  );
}
