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
import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { validateStatusGridRow, type StatusGridRow } from '@shared/types/component-manifest';
import { SEVERITY_ORDER, SEVERITY_ROLES, SeverityIcon } from './severity';

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
}

export function waitingForMessage(waitsOn: readonly string[]): string {
  return `Waiting for ${waitsOn.join(', ')} events`;
}

export function StatusGrid({ title, rows, waitsOn, isLoading, error, fileMode, columns = 3 }: StatusGridProps) {
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
              data-severity={row.severity}
              style={{
                borderLeft: `4px solid ${role.edge}`,
                background: 'var(--panel-2)',
                borderRadius: 6,
                padding: '8px 10px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                minWidth: 0,
              }}
            >
              <Text size="sm" weight="semibold" color="primary" style={{ overflowWrap: 'anywhere' }}>
                {row.label}
              </Text>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Text size="xs" color={role.textColor} style={{ display: 'inline-flex' }}>
                  <SeverityIcon severity={row.severity} />
                </Text>
                <Text size="xs" family="mono" weight="bold" color="primary">
                  {row.status}
                </Text>
                <Text size="xs" family="mono" color="secondary">
                  {role.label}
                </Text>
              </span>
              <Text size="xs" color="secondary" style={{ overflowWrap: 'anywhere' }}>
                {row.status_reason}
              </Text>
              <Text size="xs" family="mono" color="tertiary">
                {row.last_seen ? `last seen ${row.last_seen}` : 'never seen'}
              </Text>
            </div>
          );
        })}
      </div>
      {counts.length > 0 ? (
        <div data-testid="status-grid-summary" style={{ marginTop: 8 }}>
          <Text size="xs" family="mono" color="tertiary">
            {counts.map((c) => `${c.n} ${SEVERITY_ROLES[c.severity].label.toLowerCase()}`).join(' · ')}
          </Text>
        </div>
      ) : null}
      {refused.length > 0 ? (
        <div data-testid="status-grid-refused" style={{ marginTop: 6 }}>
          <Text size="xs" family="mono" color="warn">
            {`${refused.length} row${refused.length === 1 ? '' : 's'} refused: ${refused.join(' | ')}`}
          </Text>
        </div>
      ) : null}
    </ComponentWrapper>
  );
}
