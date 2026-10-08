/**
 * OMN-19993: the `alert_banner` widget kind (OV-6), ported as a visual pattern
 * from the archived dashboard's dismissible top banner.
 *
 * One banner per open critical alert, each with a colored left edge plus the
 * severity word and icon, the alert code, its subject, since-when and a link.
 * The other open alerts collapse into one line that expands. Dismissing hides a
 * banner for this mount only: it does not clear the alert, so a reload shows it
 * again while it is still open. An alert missing its code, subject or since is
 * refused and named, never drawn nameless. With nothing open, the positive empty
 * state says "All clear" and names the topic it reads.
 */
import { useState } from 'react';
import { Text } from '@/components/ui/typography';
import { validateAlertBannerRow, type AlertBannerRow } from '@shared/types/component-manifest';
import { SEVERITY_ORDER, SEVERITY_ROLES, SeverityIcon } from '../status-grid/severity';

export interface AlertBannerProps {
  alerts: readonly AlertBannerRow[];
  /** The manifest's emptyState.waits_on: the topic(s) the banner reads. */
  waitsOn: readonly string[];
}

function AlertLine({ alert, onDismiss }: { alert: AlertBannerRow; onDismiss?: () => void }) {
  const role = SEVERITY_ROLES[alert.severity];
  return (
    <div
      role={alert.severity === 'critical' ? 'alert' : undefined}
      data-testid={alert.severity === 'critical' ? 'alert-banner-critical' : 'alert-banner-line'}
      data-severity={alert.severity}
      style={{
        borderLeft: `4px solid ${role.edge}`,
        background: 'var(--panel-2)',
        borderRadius: 6,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
      }}
    >
      <Text size="sm" color={role.textColor} style={{ display: 'inline-flex' }}>
        <SeverityIcon severity={alert.severity} size={16} />
      </Text>
      <Text size="xs" family="mono" weight="bold" color="primary">
        {role.label}
      </Text>
      <Text size="sm" family="mono" weight="semibold" color="primary">
        {alert.code}
      </Text>
      <Text size="sm" color="primary">
        {alert.subject}
      </Text>
      <Text size="xs" family="mono" color="tertiary">
        {`since ${alert.since}`}
      </Text>
      <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 10, alignItems: 'center' }}>
        {alert.link ? (
          <a href={alert.link} aria-label={`Open ${alert.code} for ${alert.subject}`}>
            <Text size="xs" color="brand">
              open
            </Text>
          </a>
        ) : null}
        {onDismiss ? (
          <button type="button" onClick={onDismiss} aria-label={`Dismiss ${alert.code} for ${alert.subject}`}>
            <Text size="xs" color="secondary">
              dismiss
            </Text>
          </button>
        ) : null}
      </span>
    </div>
  );
}

export function AlertBanner({ alerts, waitsOn }: AlertBannerProps) {
  // Session-only dismissal: component state, never storage, so a reload brings an open alert back.
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  const valid: AlertBannerRow[] = [];
  const refused: string[] = [];
  for (const alert of alerts) {
    const result = validateAlertBannerRow(alert);
    if (result.valid) valid.push(alert);
    else refused.push(`${alert.alert_id || '(no id)'}: ${result.errors.join('; ')}`);
  }

  const critical = valid.filter((a) => a.severity === 'critical' && !dismissed.has(a.alert_id));
  const rest = valid
    .filter((a) => a.severity !== 'critical')
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));

  const refusedNote =
    refused.length > 0 ? (
      <div data-testid="alert-banner-refused">
        <Text size="xs" family="mono" color="warn">
          {`${refused.length} alert${refused.length === 1 ? '' : 's'} refused: ${refused.join(' | ')}`}
        </Text>
      </div>
    ) : null;

  // "All clear" is a health claim, so it needs an empty input. When every row was refused, the rows
  // still say something is open; show only the refusal rather than claiming there is nothing.
  if (valid.length === 0 && refused.length > 0) return refusedNote;

  if (valid.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          data-testid="alert-banner-clear"
          style={{
            borderLeft: `4px solid ${SEVERITY_ROLES.nominal.edge}`,
            background: 'var(--panel-2)',
            borderRadius: 6,
            padding: '8px 12px',
          }}
        >
          {`All clear: no open alerts on ${waitsOn.join(', ')}`}
        </div>
        {refusedNote}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {critical.map((alert) => (
        <AlertLine
          key={alert.alert_id}
          alert={alert}
          onDismiss={() => setDismissed((prev) => new Set(prev).add(alert.alert_id))}
        />
      ))}
      {rest.length > 0 ? (
        <div data-testid="alert-banner-collapsed" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            <Text size="xs" family="mono" color="secondary">
              {`${rest.length} more open alert${rest.length === 1 ? '' : 's'}`}
            </Text>
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
              <Text size="xs" color="brand">
                {expanded ? 'hide' : 'show'}
              </Text>
            </button>
          </span>
          {expanded ? rest.map((alert) => <AlertLine key={alert.alert_id} alert={alert} />) : null}
        </div>
      ) : null}
      {refusedNote}
    </div>
  );
}
