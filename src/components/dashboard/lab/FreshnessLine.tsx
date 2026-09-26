import type { ProjectionDataFreshness } from '@/data-source';
import { Text } from '@/components/ui/typography';
import { formatAge } from '@/utils/time-format';

export function FreshnessLine({
  freshness,
  latestEventAt,
  readAt,
}: {
  freshness: ProjectionDataFreshness;
  latestEventAt: string | null;
  readAt: string;
}) {
  const readAtMs = new Date(readAt).getTime();
  return (
    <Text as="span" size="xs" family="mono" color={freshness === 'fresh' ? 'ok' : 'warn'}>
      {freshness} · latest {formatAge(latestEventAt, readAtMs)} old at read
    </Text>
  );
}
