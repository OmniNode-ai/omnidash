import type {
  DimensionStatus,
  ReadinessDimension,
  ReadinessSummary,
} from '@/components/dashboard/readiness/ReadinessGate';

export interface BuildReadinessRowsOptions {
  /**
   * Status mix preset. Default 'mixed'.
   *
   * - 'all-green': every dimension PASS, overallStatus PASS.
   * - 'mixed': blend of PASS / WARN / FAIL, overallStatus WARN.
   * - 'all-red': every dimension FAIL, overallStatus FAIL.
   */
  preset?: 'all-green' | 'mixed' | 'all-red';
  /** Override capture timestamp; default = now. */
  lastCheckedAt?: string;
}

const DIMENSION_NAMES = [
  'Database',
  'Kafka',
  'CI Pipeline',
  'Schema Drift',
  'Plugin Registry',
  'Container Health',
  'Runtime Health',
];

const PRESET_STATUSES: Record<
  NonNullable<BuildReadinessRowsOptions['preset']>,
  DimensionStatus[]
> = {
  'all-green': ['PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS'],
  mixed: ['PASS', 'WARN', 'PASS', 'FAIL', 'PASS', 'WARN', 'PASS'],
  'all-red': ['FAIL', 'FAIL', 'FAIL', 'FAIL', 'FAIL', 'FAIL', 'FAIL'],
};

const STATUS_DETAILS: Record<DimensionStatus, string> = {
  PASS: 'Healthy — all checks green',
  WARN: 'Degraded — see logs for context',
  FAIL: 'Failing — immediate attention required',
};

/**
 * Build a `ReadinessSummary` with `count` dimensions sourced from a
 * status preset. Default `count=7` matches the canonical seven-pillar
 * readiness layout the widget was designed against.
 */
export function buildReadinessRows(
  count = 7,
  opts: BuildReadinessRowsOptions = {},
): ReadinessSummary {
  const preset = opts.preset ?? 'mixed';
  const statuses = PRESET_STATUSES[preset];
  const dimensions: ReadinessDimension[] = [];
  for (let i = 0; i < count; i++) {
    const status = statuses[i % statuses.length];
    dimensions.push({
      name: DIMENSION_NAMES[i % DIMENSION_NAMES.length],
      status,
      detail: STATUS_DETAILS[status],
    });
  }

  let overallStatus: DimensionStatus = 'PASS';
  if (dimensions.some((d) => d.status === 'FAIL')) {
    overallStatus = preset === 'all-red' ? 'FAIL' : 'WARN';
  } else if (dimensions.some((d) => d.status === 'WARN')) {
    overallStatus = 'WARN';
  }

  return {
    dimensions,
    overallStatus,
    lastCheckedAt: opts.lastCheckedAt ?? new Date().toISOString(),
  };
}
