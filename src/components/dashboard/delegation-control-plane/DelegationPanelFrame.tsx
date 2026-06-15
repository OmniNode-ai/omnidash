import type { ReactNode } from 'react';
import { Text } from '@/components/ui/typography';

// OMN-12785: every demo-visible panel must declare its data authority.
// projection-backed = read from projection-API (/projection/{topic})
// runtime-observed  = live runtime metric (e.g. consumer-group lag)
// degraded          = data source is stale / behind SLA
// hidden            = panel is hidden because the data path is not wired
export type PanelAuthority = 'projection-backed' | 'runtime-observed' | 'degraded' | 'hidden';

const AUTHORITY_STYLE: Record<PanelAuthority, { label: string; color: string; bg: string; border: string }> = {
  'projection-backed': {
    label: 'projection-backed',
    color: 'var(--color-ok, #22c55e)',
    bg: 'color-mix(in srgb, var(--color-ok, #22c55e) 10%, transparent)',
    border: 'color-mix(in srgb, var(--color-ok, #22c55e) 25%, transparent)',
  },
  'runtime-observed': {
    label: 'runtime-observed',
    color: 'var(--color-brand, #6366f1)',
    bg: 'color-mix(in srgb, var(--color-brand, #6366f1) 10%, transparent)',
    border: 'color-mix(in srgb, var(--color-brand, #6366f1) 25%, transparent)',
  },
  degraded: {
    label: 'degraded',
    color: 'var(--color-warn, #f59e0b)',
    bg: 'color-mix(in srgb, var(--color-warn, #f59e0b) 10%, transparent)',
    border: 'color-mix(in srgb, var(--color-warn, #f59e0b) 25%, transparent)',
  },
  hidden: {
    label: 'hidden',
    color: 'var(--text-tertiary, #888)',
    bg: 'var(--panel-2)',
    border: 'var(--line-2)',
  },
};

export function DelegationPanelFrame({
  title,
  subtitle,
  authority,
  children,
}: {
  title: string;
  subtitle?: string;
  /** OMN-12785: required data-authority label for every demo-visible widget. */
  authority?: PanelAuthority;
  children: ReactNode;
}) {
  const auth = authority ? AUTHORITY_STYLE[authority] : null;
  return (
    <section
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: 12,
        minWidth: 0,
      }}
    >
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <Text as="div" size="sm" weight="semibold" color="primary">
            {title}
          </Text>
          {auth && (
            <span
              style={{
                display: 'inline-block',
                padding: '1px 6px',
                borderRadius: 4,
                background: auth.bg,
                border: `1px solid ${auth.border}`,
                color: auth.color,
              }}
            >
              <Text as="span" size="xs" family="mono" color="inherit">
                {auth.label}
              </Text>
            </span>
          )}
        </div>
        {subtitle && (
          <Text as="div" size="xs" color="tertiary">
            {subtitle}
          </Text>
        )}
      </div>
      {children}
    </section>
  );
}

export function EmptyPanel({ message }: { message: string }) {
  return (
    <Text as="div" size="sm" color="tertiary" style={{ padding: '8px 0' }}>
      {message}
    </Text>
  );
}
