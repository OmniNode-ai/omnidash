/**
 * Validation Dashboard Mock Data Generator
 *
 * Generates realistic mock data for the Cross-Repo Validation dashboard
 * when the database is unavailable. Used for graceful degradation.
 *
 * Part of OMN-1907: Cross-Repo Validation Dashboard Integration
 */

import type {
  ValidationRun,
  Violation,
  RepoTrends,
  RepoTrendPoint,
  LifecycleCandidate,
  LifecycleTierMetrics,
  LifecycleSummary,
  LifecycleTier,
  CandidateStatus,
} from '@shared/validation-types';
import { LIFECYCLE_TIERS } from '@shared/validation-types';
import { generateUUID } from '@shared/uuid';

// ===========================
// Constants
// ===========================

/** Realistic OmniNode repository names */
const MOCK_REPOS = [
  'omnibase_core',
  'omniarchon',
  'omniclaude',
  'omnidash',
  'omnibase_infra',
  'onex_runtime',
  'onex_cli',
  'omni_registry',
] as const;

/** Cross-repo validator names matching ONEX validator naming */
const MOCK_VALIDATORS = [
  'schema-validator',
  'dependency-checker',
  'contract-verifier',
  'metadata-stamper',
  'lint-aggregator',
  'type-consistency',
  'api-contract-validator',
  'version-compat-checker',
] as const;

/** Realistic rule IDs that validators produce */
const MOCK_RULES: Array<{
  rule_id: string;
  severity: 'error' | 'warning' | 'info';
  validator: string;
  message: string;
}> = [
  {
    rule_id: 'SCHEMA-001',
    severity: 'error',
    validator: 'schema-validator',
    message: 'Missing required field "version" in node manifest',
  },
  {
    rule_id: 'SCHEMA-002',
    severity: 'error',
    validator: 'schema-validator',
    message: 'Invalid stamping protocol version: expected v2, got v1',
  },
  {
    rule_id: 'SCHEMA-003',
    severity: 'warning',
    validator: 'schema-validator',
    message: 'Deprecated field "legacy_id" should be migrated to "onex_id"',
  },
  {
    rule_id: 'DEP-001',
    severity: 'error',
    validator: 'dependency-checker',
    message: 'Circular dependency detected between omnibase_core and onex_runtime',
  },
  {
    rule_id: 'DEP-002',
    severity: 'warning',
    validator: 'dependency-checker',
    message: 'Unused dependency "lodash" declared in package.json',
  },
  {
    rule_id: 'DEP-003',
    severity: 'info',
    validator: 'dependency-checker',
    message: 'Dependency "zod" version pinned — consider using caret range',
  },
  {
    rule_id: 'CONTRACT-001',
    severity: 'error',
    validator: 'contract-verifier',
    message: 'Breaking change: removed field "context_id" from AgentAction interface',
  },
  {
    rule_id: 'CONTRACT-002',
    severity: 'warning',
    validator: 'contract-verifier',
    message: 'New required field added without default value in ValidationRunStarted',
  },
  {
    rule_id: 'META-001',
    severity: 'warning',
    validator: 'metadata-stamper',
    message: 'Node missing ONEX metadata stamp — run `onex stamp` to fix',
  },
  {
    rule_id: 'META-002',
    severity: 'info',
    validator: 'metadata-stamper',
    message: 'Metadata stamp is 14 days old — consider refreshing',
  },
  {
    rule_id: 'LINT-001',
    severity: 'warning',
    validator: 'lint-aggregator',
    message: 'ESLint: no-unused-vars across 3 files in shared/',
  },
  {
    rule_id: 'LINT-002',
    severity: 'info',
    validator: 'lint-aggregator',
    message: 'Prettier formatting differences in 2 files',
  },
  {
    rule_id: 'TYPE-001',
    severity: 'error',
    validator: 'type-consistency',
    message:
      'Type mismatch: AgentRoutingDecision.confidence is number in bridge but string in archon',
  },
  {
    rule_id: 'TYPE-002',
    severity: 'warning',
    validator: 'type-consistency',
    message: 'Shared type "EventPayload" has different optional fields across repos',
  },
  {
    rule_id: 'API-001',
    severity: 'error',
    validator: 'api-contract-validator',
    message: 'Endpoint POST /api/agents removed without deprecation period',
  },
  {
    rule_id: 'API-002',
    severity: 'info',
    validator: 'api-contract-validator',
    message: 'New endpoint GET /api/validation/summary added',
  },
  {
    rule_id: 'VER-001',
    severity: 'warning',
    validator: 'version-compat-checker',
    message: 'omnibase_core@2.3.0 requires onex_runtime@>=1.5.0, found 1.4.2',
  },
  {
    rule_id: 'VER-002',
    severity: 'info',
    validator: 'version-compat-checker',
    message: 'All cross-repo version constraints satisfied',
  },
];

/** Possible triggering users/systems */
const MOCK_TRIGGERS = [
  'ci/main-merge',
  'ci/nightly',
  'jonah@omninode.ai',
  'schedule/daily-04:00',
  'manual/pre-release',
  'ci/pr-check',
] as const;

/** Realistic file paths for violations */
const MOCK_FILE_PATHS = [
  'shared/schema.ts',
  'shared/intelligence-schema.ts',
  'server/routes.ts',
  'server/event-consumer.ts',
  'client/src/lib/data-sources/index.ts',
  'src/nodes/node_manifest.py',
  'src/stamping/protocol.py',
  'package.json',
  'tsconfig.json',
  'agents/configs/routing.yaml',
  'src/core/runtime.py',
  'src/contracts/agent_action.py',
];

// ===========================
// Utility Functions
// ===========================

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals = 2): number {
  const value = Math.random() * (max - min) + min;
  return parseFloat(value.toFixed(decimals));
}

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomSubset<T>(arr: readonly T[], min: number, max: number): T[] {
  const count = randomInt(min, Math.min(max, arr.length));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function pastDate(daysAgo: number, hoursOffset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(date.getHours() - hoursOffset);
  return date.toISOString();
}

// ===========================
// Mock Data Generators
// ===========================

/**
 * Generate mock violations for a single validation run.
 * Distribution: ~20% errors, ~45% warnings, ~35% info
 */
function generateMockViolations(count: number, repos: string[]): Violation[] {
  const violations: Violation[] = [];

  for (let i = 0; i < count; i++) {
    const rule = randomItem(MOCK_RULES);
    const repo = randomItem(repos);
    const hasFile = Math.random() > 0.2; // 80% have file paths
    const hasLine = hasFile && Math.random() > 0.3; // 70% of filed violations have line numbers

    violations.push({
      rule_id: rule.rule_id,
      severity: rule.severity,
      message: rule.message,
      repo,
      file_path: hasFile ? randomItem(MOCK_FILE_PATHS) : undefined,
      line: hasLine ? randomInt(1, 500) : undefined,
      validator: rule.validator,
    });
  }

  return violations;
}

/**
 * Generate a single mock validation run with realistic data.
 */
function generateMockRun(daysAgo: number, statusOverride?: ValidationRun['status']): ValidationRun {
  const repos = randomSubset(MOCK_REPOS, 2, 5);
  const validators = randomSubset(MOCK_VALIDATORS, 2, 6);
  const status =
    statusOverride ??
    randomItem(['passed', 'passed', 'passed', 'failed', 'failed', 'error'] as const);

  const isRunning = status === 'running';
  const isPassed = status === 'passed';
  const durationMs = isRunning ? undefined : randomInt(8000, 120000);
  const startedAt = pastDate(daysAgo, randomInt(0, 23));
  const completedAt = isRunning
    ? undefined
    : new Date(new Date(startedAt).getTime() + (durationMs ?? 0)).toISOString();

  // Passed runs have 0 violations; failed/error runs have some
  const violationCount = isPassed ? 0 : isRunning ? randomInt(0, 5) : randomInt(1, 25);
  const violations = generateMockViolations(violationCount, repos);

  // Aggregate severity counts
  const violationsBySeverity: Record<string, number> = {};
  for (const v of violations) {
    violationsBySeverity[v.severity] = (violationsBySeverity[v.severity] ?? 0) + 1;
  }

  return {
    run_id: generateUUID(),
    repos,
    validators,
    triggered_by: randomItem(MOCK_TRIGGERS),
    status,
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: durationMs,
    total_violations: violationCount,
    violations_by_severity: violationsBySeverity,
    violations,
  };
}

/**
 * Generate a list of mock validation runs spread across a time window.
 * Includes 1-2 currently running runs for realism.
 */
export function generateMockRuns(count = 20): ValidationRun[] {
  const runs: ValidationRun[] = [];

  // 1-2 currently running (capped to count)
  const runningCount = Math.min(randomInt(1, 2), count);
  for (let i = 0; i < runningCount; i++) {
    runs.push(generateMockRun(0, 'running'));
  }

  // Remaining are completed, spread over 14 days
  for (let i = 0; i < Math.max(0, count - runningCount); i++) {
    const daysAgo = randomFloat(0, 14, 1);
    runs.push(generateMockRun(daysAgo));
  }

  // Sort by started_at descending (most recent first)
  return runs.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
}

/**
 * Generate a summary response from mock runs.
 */
export function generateMockSummary(runs: ValidationRun[]): {
  total_runs: number;
  completed_runs: number;
  running_runs: number;
  unique_repos: number;
  repos: string[];
  pass_rate: number;
  total_violations_by_severity: Record<string, number>;
} {
  const repoSet = new Set<string>();
  let completedRuns = 0;
  let runningRuns = 0;
  let passedRuns = 0;
  const totalBySeverity: Record<string, number> = {};

  for (const run of runs) {
    for (const repo of run.repos) {
      repoSet.add(repo);
    }

    if (run.status === 'running') {
      runningRuns++;
    } else {
      completedRuns++;
      if (run.status === 'passed') passedRuns++;
    }

    for (const [sev, count] of Object.entries(run.violations_by_severity)) {
      totalBySeverity[sev] = (totalBySeverity[sev] ?? 0) + count;
    }
  }

  return {
    total_runs: runs.length,
    completed_runs: completedRuns,
    running_runs: runningRuns,
    unique_repos: repoSet.size,
    repos: Array.from(repoSet).sort(),
    pass_rate: completedRuns > 0 ? passedRuns / completedRuns : 0,
    total_violations_by_severity: totalBySeverity,
  };
}

/**
 * Generate mock repo trend data over a 30-day window.
 * Shows a realistic pattern: higher violations early, trending down over time.
 */
export function generateMockRepoTrends(repo: string, runs: ValidationRun[]): RepoTrends {
  // Filter completed runs that include this repo
  const repoRuns = runs
    .filter((r) => r.status !== 'running' && r.repos.includes(repo))
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

  const trend: RepoTrendPoint[] = repoRuns.map((run) => {
    // Count violations for this specific repo
    let errors = 0;
    let warnings = 0;
    let infos = 0;
    for (const v of run.violations) {
      if (v.repo === repo) {
        if (v.severity === 'error') errors++;
        else if (v.severity === 'warning') warnings++;
        else if (v.severity === 'info') infos++;
      }
    }

    return {
      date: run.started_at.slice(0, 10),
      errors,
      warnings,
      infos,
      total: errors + warnings + infos,
    };
  });

  return {
    repo,
    trend,
    latest_run_id: repoRuns.at(-1)?.run_id,
  };
}

// ===========================
// Lifecycle Mock Data Generators (OMN-2152)
// ===========================

/** Realistic candidate rule names for lifecycle tracking */
const LIFECYCLE_RULE_NAMES = [
  'Enforce ONEX metadata stamp on all nodes',
  'Require version field in manifests',
  'Validate cross-repo type consistency',
  'Ban circular dependency chains',
  'Enforce API deprecation period (30 days)',
  'Require caret range for shared dependencies',
  'Validate contract field compatibility',
  'Enforce lint-free shared modules',
  'Pin Python runtime to 3.12+',
  'Require unit test coverage >= 80%',
  'Validate Kafka topic naming convention',
  'Enforce PEP 604 union types',
  'Ban Optional[] in new code',
  'Require docstring on public functions',
  'Validate event schema backward compat',
  'Enforce node naming convention (Node<Name><Type>)',
  'Require typed returns on all handlers',
  'Ban any type in shared interfaces',
  'Validate Drizzle schema matches DB',
  'Enforce canonical topic prefix format',
] as const;

/**
 * Generate a single mock lifecycle candidate.
 */
function generateMockCandidate(index: number): LifecycleCandidate {
  // Distribute candidates across tiers with a funnel shape:
  // observed(40%) > suggested(25%) > shadow_apply(18%) > promoted(12%) > default(5%)
  const tierRoll = Math.random();
  let tier: LifecycleTier;
  if (tierRoll < 0.4) tier = 'observed';
  else if (tierRoll < 0.65) tier = 'suggested';
  else if (tierRoll < 0.83) tier = 'shadow_apply';
  else if (tierRoll < 0.95) tier = 'promoted';
  else tier = 'default';

  // Status distribution depends on tier maturity
  let status: CandidateStatus;
  if (tier === 'default') {
    // Default tier: mostly pass
    status = Math.random() < 0.9 ? 'pass' : 'pending';
  } else if (tier === 'promoted') {
    // Promoted: high pass rate
    const sRoll = Math.random();
    if (sRoll < 0.7) status = 'pass';
    else if (sRoll < 0.85) status = 'pending';
    else if (sRoll < 0.95) status = 'fail';
    else status = 'quarantine';
  } else if (tier === 'shadow_apply') {
    // Shadow apply: mixed results
    const sRoll = Math.random();
    if (sRoll < 0.45) status = 'pass';
    else if (sRoll < 0.65) status = 'pending';
    else if (sRoll < 0.85) status = 'fail';
    else status = 'quarantine';
  } else {
    // Observed/suggested: more pending and failures
    const sRoll = Math.random();
    if (sRoll < 0.3) status = 'pass';
    else if (sRoll < 0.55) status = 'pending';
    else if (sRoll < 0.8) status = 'fail';
    else status = 'quarantine';
  }

  const rule = MOCK_RULES[index % MOCK_RULES.length];
  const ruleName = LIFECYCLE_RULE_NAMES[index % LIFECYCLE_RULE_NAMES.length];
  const daysAtTier = randomFloat(0.5, 45, 1);
  const totalRuns = randomInt(1, 50);
  const passStreak = status === 'pass' ? randomInt(1, Math.min(totalRuns, 15)) : 0;
  const failStreak = status === 'fail' ? randomInt(1, Math.min(totalRuns, 5)) : 0;

  return {
    candidate_id: generateUUID(),
    rule_name: ruleName,
    rule_id: rule.rule_id,
    tier,
    status,
    source_repo: randomItem(MOCK_REPOS),
    entered_tier_at: pastDate(daysAtTier),
    last_validated_at: pastDate(randomFloat(0, 2, 1)),
    pass_streak: passStreak,
    fail_streak: failStreak,
    total_runs: totalRuns,
  };
}

/**
 * Generate mock lifecycle tier metrics from a set of candidates.
 */
function generateTierMetrics(candidates: LifecycleCandidate[]): LifecycleTierMetrics[] {
  return LIFECYCLE_TIERS.map((tier, tierIndex) => {
    const tierCandidates = candidates.filter((c) => c.tier === tier);
    const byStatus: Record<CandidateStatus, number> = {
      pending: 0,
      pass: 0,
      fail: 0,
      quarantine: 0,
    };

    for (const c of tierCandidates) {
      byStatus[c.status]++;
    }

    // Transition rates increase with maturity
    const baseTransitionRates = [0.35, 0.5, 0.6, 0.75, 0.0]; // default has no next tier
    const transitionRate = randomFloat(
      Math.max(0, baseTransitionRates[tierIndex] - 0.1),
      Math.min(1, baseTransitionRates[tierIndex] + 0.1),
      2
    );

    // Average days at tier decreases as maturity increases (faster promotion)
    const baseDays = [14, 10, 7, 5, 0];
    const avgDays = randomFloat(Math.max(1, baseDays[tierIndex] - 3), baseDays[tierIndex] + 5, 1);

    return {
      tier,
      count: tierCandidates.length,
      by_status: byStatus,
      avg_days_at_tier: tier === 'default' ? 0 : avgDays,
      transition_rate: tier === 'default' ? 0 : transitionRate,
    };
  });
}

/**
 * Generate a complete lifecycle summary with candidates and tier metrics.
 */
export function generateMockLifecycleSummary(candidateCount = 30): LifecycleSummary {
  const candidates: LifecycleCandidate[] = [];
  for (let i = 0; i < candidateCount; i++) {
    candidates.push(generateMockCandidate(i));
  }

  const tiers = generateTierMetrics(candidates);

  const byStatus: Record<CandidateStatus, number> = {
    pending: 0,
    pass: 0,
    fail: 0,
    quarantine: 0,
  };

  for (const c of candidates) {
    byStatus[c.status]++;
  }

  return {
    total_candidates: candidates.length,
    tiers,
    by_status: byStatus,
    candidates,
  };
}

// ===========================
// Singleton Cache
// ===========================

let cachedRuns: ValidationRun[] | null = null;
let cachedLifecycle: LifecycleSummary | null = null;

/**
 * Get cached mock validation runs (generates once per session).
 */
export function getMockRuns(): ValidationRun[] {
  if (!cachedRuns) {
    cachedRuns = generateMockRuns(20);
  }
  return cachedRuns;
}

/**
 * Get cached mock summary derived from the cached runs.
 */
export function getMockSummary() {
  return generateMockSummary(getMockRuns());
}

/**
 * Get cached mock repo trends derived from the cached runs.
 */
export function getMockRepoTrends(repo: string): RepoTrends {
  return generateMockRepoTrends(repo, getMockRuns());
}

/**
 * Get a single run by ID from mock data, or null if not found.
 */
export function getMockRunDetail(runId: string): ValidationRun | null {
  return getMockRuns().find((r) => r.run_id === runId) ?? null;
}

/**
 * Get cached mock lifecycle summary (generates once per session).
 */
export function getMockLifecycleSummary(): LifecycleSummary {
  if (!cachedLifecycle) {
    cachedLifecycle = generateMockLifecycleSummary(30);
  }
  return cachedLifecycle;
}

/**
 * Clear cached mock data (useful for testing).
 */
export function clearValidationMockCache(): void {
  cachedRuns = null;
  cachedLifecycle = null;
}
