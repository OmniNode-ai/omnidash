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
import { readableTime } from '@/theme/format';
import { validateAlertBannerRow, type AlertBannerRow } from '@shared/types/component-manifest';
import { SEVERITY_ORDER, SEVERITY_ROLES, SeverityIcon } from '../status-grid/severity';
// OMN-23330 AC25: this file's fixed inline styles are classes in AlertBanner.static.css.
import './AlertBanner.static.css';

export interface AlertBannerProps {
  alerts: readonly AlertBannerRow[];
  /** The manifest's emptyState.waits_on: the topic(s) the banner reads. */
  waitsOn: readonly string[];
  /** Presentation only: the original code remains the row's machine identity. */
  codeLabel?: (code: string) => string;
  refusalMessage?: string;
}

function AlertLine({ alert, onDismiss, codeLabel }: { alert: AlertBannerRow; onDismiss?: () => void; codeLabel?: (code: string) => string }) {
  const role = SEVERITY_ROLES[alert.severity];
  const label = codeLabel ? codeLabel(alert.code) : alert.code;
  return (
    <div
      role={alert.severity === 'critical' ? 'alert' : undefined}
      data-testid={alert.severity === 'critical' ? 'alert-banner-critical' : 'alert-banner-line'}
      data-severity={alert.severity}
      style={{
        borderLeft: `4px solid ${role.edge}`,
        background: 'var(--ds-surface-2)',
        borderRadius: 6,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
      }}
    >
      <Text className="alert-banner-sd87841" size="sm" color={role.textColor}>
        <SeverityIcon severity={alert.severity} size={16} />
      </Text>
      <Text size="xs" family="mono" weight="bold" color="primary">
        {role.label}
      </Text>
      <span data-alert-code={alert.code}><Text size="sm" family="mono" weight="semibold" color="primary">
        {label}
      </Text></span>
      <Text size="sm" color="primary">
        {alert.subject}
      </Text>
      <Text size="xs" family="mono" color="tertiary">
        {/* OMN-21166 part 26 AC159: the same readable UTC as the service cards; an unparseable value shows as served. */}
        {`since ${readableTime(alert.since) ?? alert.since}`}
      </Text>
      <span className="alert-banner-sdbdc80">
        {alert.link ? (
          <a href={alert.link} aria-label={`Open ${label} for ${alert.subject}`}>
            <Text size="xs" color="brand">
              open
            </Text>
          </a>
        ) : null}
        {onDismiss ? (
          <button type="button" onClick={onDismiss} aria-label={`Dismiss ${label} for ${alert.subject}`}>
            <Text size="xs" color="secondary">
              dismiss
            </Text>
          </button>
        ) : null}
      </span>
    </div>
  );
}

export function AlertBanner({ alerts, waitsOn, codeLabel, refusalMessage }: AlertBannerProps) {
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
          {refusalMessage ?? `${refused.length} alert${refused.length === 1 ? '' : 's'} refused: ${refused.join(' | ')}`}
        </Text>
      </div>
    ) : null;

  // "All clear" is a health claim, so it needs an empty input. When every row was refused, the rows
  // still say something is open; show only the refusal rather than claiming there is nothing.
  if (valid.length === 0 && refused.length > 0) return refusedNote;

  if (valid.length === 0) {
    return (
      <div className="alert-banner-s9808a2">
        <div
          data-testid="alert-banner-clear"
          style={{
            borderLeft: `4px solid ${SEVERITY_ROLES.nominal.edge}`,
            background: 'var(--ds-surface-2)',
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
    <div className="alert-banner-s9808a2">
      {critical.map((alert) => (
        <AlertLine
          key={alert.alert_id}
          alert={alert}
          codeLabel={codeLabel}
          onDismiss={() => setDismissed((prev) => new Set(prev).add(alert.alert_id))}
        />
      ))}
      {rest.length > 0 ? (
        <div className="alert-banner-s9808a2" data-testid="alert-banner-collapsed">
          <span className="alert-banner-sc01a00">
            <Text size="xs" family="mono" color="secondary">
              {`${rest.length} more open alert${rest.length === 1 ? '' : 's'}`}
            </Text>
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
              <Text size="xs" color="brand">
                {expanded ? 'hide' : 'show'}
              </Text>
            </button>
          </span>
          {expanded ? rest.map((alert) => <AlertLine key={alert.alert_id} alert={alert} codeLabel={codeLabel} />) : null}
        </div>
      ) : null}
      {refusedNote}
    </div>
  );
}
