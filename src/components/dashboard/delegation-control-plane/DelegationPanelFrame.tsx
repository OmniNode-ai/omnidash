import type { ReactNode } from 'react';
import { Text } from '@/components/ui/typography';

export function DelegationPanelFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
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
        <Text as="div" size="sm" weight="semibold" color="primary">
          {title}
        </Text>
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
