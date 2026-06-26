import type { ReactNode } from 'react';
import { Text } from '@/components/ui/typography';

interface SectionCardProps {
  /** Uppercase microlabel above the card content. */
  eyebrow: string;
  /** Optional secondary line under the eyebrow. */
  sub?: ReactNode;
  isLoading?: boolean;
  error?: Error | null;
  isEmpty?: boolean;
  emptyMessage?: string;
  /** When true, the card's data is fixtures/sample, not live (`provisioned: false`). */
  sample?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * The card frame every dashboard section renders inside. Owns the truthful
 * loading / error / empty states and the "Sample data" marker, so individual
 * sections only describe their happy-path content. A trimmed successor to the
 * deleted builder ComponentWrapper — no drag chrome, no kebab, no config.
 */
export function SectionCard({
  eyebrow,
  sub,
  isLoading,
  error,
  isEmpty,
  emptyMessage,
  sample,
  className,
  children,
}: SectionCardProps) {
  return (
    <section className={`sd-card${className ? ` ${className}` : ''}`}>
      <div className="sd-card-head">
        <Text as="span" size="xs" color="tertiary" transform="uppercase" weight="semibold">
          {eyebrow}
        </Text>
        {sample && (
          <span
            className="sd-sample"
            title="Sample data — not live. Connect a projection backend for real numbers."
          >
            <Text as="span" size="xs" weight="semibold" color="warn">Sample data</Text>
          </span>
        )}
      </div>

      {sub && <div className="sd-sub">{sub}</div>}

      <div className="sd-card-body">
        {isLoading ? (
          <Text as="div" size="lg" color="tertiary">Loading…</Text>
        ) : error ? (
          <Text as="div" size="lg" color="bad">Couldn&apos;t load this section: {error.message}</Text>
        ) : isEmpty ? (
          <Text as="div" size="lg" color="tertiary">{emptyMessage ?? 'No data for this period yet.'}</Text>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
