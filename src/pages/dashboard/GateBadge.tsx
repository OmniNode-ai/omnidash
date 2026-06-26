import { Text } from '@/components/ui/typography';

/** The quality-gate result chip. `undefined` (no decision matched) renders an
 *  em-dash, never a fabricated pass. */
export function GateBadge({ passed }: { passed: boolean | undefined }) {
  if (passed === undefined) return <Text as="span" size="md" color="tertiary">—</Text>;
  return (
    <span className={`sd-badge ${passed ? 'sd-badge-pass' : 'sd-badge-fail'}`}>
      <Text as="span" size="sm" weight="semibold" color={passed ? 'ok' : 'bad'}>
        {passed ? 'Pass' : 'Fail'}
      </Text>
    </span>
  );
}
