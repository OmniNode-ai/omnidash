#!/usr/bin/env tsx

/* eslint-disable no-console */

/**
 * Seed Effectiveness Tables Script
 *
 * Populates the 3 effectiveness PostgreSQL tables with realistic test data
 * for end-to-end dashboard testing.
 *
 * Tables:
 *   - injection_effectiveness (~500 rows)
 *   - latency_breakdowns (~300 rows)
 *   - pattern_hit_rates (~200 rows)
 *
 * Run with: npm run seed-effectiveness
 * Dry run:  npm run seed-effectiveness -- --dry-run
 *
 * @see OMN-1891 - Build Effectiveness Dashboard
 */

import 'dotenv/config';
import pg from 'pg';
import { randomUUID } from 'crypto';

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes('--dry-run');

const INJECTION_EFFECTIVENESS_COUNT = 500;
const LATENCY_BREAKDOWNS_COUNT = 300;
const PATTERN_HIT_RATES_COUNT = 200;

const DAYS_BACK = 30;

// Realistic value pools
const AGENT_NAMES = [
  'agent-polymorphic',
  'agent-api-architect',
  'agent-performance',
  'agent-debug',
  'agent-testing',
  'agent-frontend-developer',
  'agent-documentation-architect',
  'agent-code-quality-analyzer',
  'agent-security-audit',
  'agent-devops-infrastructure',
];

const DETECTION_METHODS = [
  'ast_analysis',
  'token_overlap',
  'embedding_similarity',
  'exact_match',
  'fuzzy_match',
];

const UTILIZATION_METHODS = [
  'ast_diff',
  'token_overlap',
  'llm_judge',
  'embedding_cosine',
  'structural_match',
];

const SESSION_OUTCOMES = ['success', 'success', 'success', 'partial', 'failure'];
// Weighted toward success to reflect realistic system behavior

const PATTERN_IDS = [
  'singleton',
  'factory',
  'observer',
  'strategy',
  'decorator',
  'adapter',
  'builder',
  'command',
  'iterator',
  'mediator',
  'prototype',
  'proxy',
  'chain-of-responsibility',
  'composite',
  'facade',
  'flyweight',
  'state',
  'template-method',
  'visitor',
  'bridge',
].map((name) => ({ name, id: randomUUID() }));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Clamp a value between min and max */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Generate a timestamp within the last N days, biased slightly toward recent dates.
 * The `dayProgress` param (0..1) represents how far through the period we are,
 * allowing callers to create ordered/trending data.
 */
function timestampAtProgress(progress: number): Date {
  const now = Date.now();
  const msBack = DAYS_BACK * 24 * 60 * 60 * 1000;
  // progress 0 = DAYS_BACK ago, progress 1 = now
  const ts = now - msBack + progress * msBack;
  // Add some jitter (+/- 6 hours) to avoid perfectly uniform timestamps
  const jitter = (Math.random() - 0.5) * 12 * 60 * 60 * 1000;
  return new Date(clamp(ts + jitter, now - msBack, now));
}

/**
 * Apply an upward trend to a base value.
 * At progress=0 the value is shifted down; at progress=1 it is shifted up.
 * The trendStrength controls how much the trend influences the value.
 */
function withTrend(
  baseMin: number,
  baseMax: number,
  progress: number,
  trendStrength: number = 0.15
): number {
  const base = randomFloat(baseMin, baseMax);
  const trendShift = (progress - 0.5) * 2 * trendStrength * (baseMax - baseMin);
  return clamp(base + trendShift, baseMin, baseMax);
}

// ---------------------------------------------------------------------------
// Database connection
// ---------------------------------------------------------------------------

function buildConnectionString(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.POSTGRES_HOST;
  const port = process.env.POSTGRES_PORT || '5436';
  const database = process.env.POSTGRES_DATABASE || 'omninode_bridge';
  const user = process.env.POSTGRES_USER || 'postgres';
  const password = process.env.POSTGRES_PASSWORD;

  if (!host || !password) {
    console.error(
      'Error: Database connection details not found.\n' +
        'Set DATABASE_URL or POSTGRES_HOST + POSTGRES_PASSWORD in your .env file.'
    );
    process.exit(1);
  }

  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

// ---------------------------------------------------------------------------
// Data generators
// ---------------------------------------------------------------------------

interface InjectionEffectivenessRow {
  id: string;
  session_id: string;
  correlation_id: string;
  cohort: string;
  injection_occurred: boolean;
  agent_name: string | null;
  detection_method: string | null;
  utilization_score: string | null;
  utilization_method: string | null;
  agent_match_score: string | null;
  user_visible_latency_ms: number | null;
  session_outcome: string | null;
  routing_time_ms: number | null;
  retrieval_time_ms: number | null;
  injection_time_ms: number | null;
  patterns_count: number | null;
  cache_hit: boolean;
  created_at: Date;
}

function generateInjectionEffectiveness(count: number): InjectionEffectivenessRow[] {
  const rows: InjectionEffectivenessRow[] = [];

  for (let i = 0; i < count; i++) {
    const progress = i / (count - 1); // 0..1
    const ts = timestampAtProgress(progress);

    // 70% treatment, 30% control (realistic A/B split)
    const cohort = Math.random() < 0.7 ? 'treatment' : 'control';
    // Treatment sessions have injection ~80% of the time (trending up)
    const injectionOccurred =
      cohort === 'treatment' ? Math.random() < withTrend(0.7, 0.9, progress, 0.1) : false;

    const sessionId = randomUUID();
    const correlationId = randomUUID();

    // Latency: control baseline 80-200ms, treatment adds overhead
    const baseLatency = randomInt(80, 200);
    const treatmentOverhead = injectionOccurred ? randomInt(5, 80) : 0;
    // Overhead decreases over time (system improving)
    const trendedOverhead = Math.round(treatmentOverhead * (1 - progress * 0.3));
    const latency = baseLatency + trendedOverhead;

    const routingTime = randomInt(5, 30);
    const retrievalTime = injectionOccurred ? randomInt(10, 60) : null;
    const injectionTime = injectionOccurred ? randomInt(3, 25) : null;

    rows.push({
      id: randomUUID(),
      session_id: sessionId,
      correlation_id: correlationId,
      cohort,
      injection_occurred: injectionOccurred,
      agent_name: injectionOccurred ? randomItem(AGENT_NAMES) : null,
      detection_method: injectionOccurred ? randomItem(DETECTION_METHODS) : null,
      utilization_score: injectionOccurred ? withTrend(0.4, 0.85, progress, 0.12).toFixed(6) : null,
      utilization_method: injectionOccurred ? randomItem(UTILIZATION_METHODS) : null,
      agent_match_score: injectionOccurred ? withTrend(0.7, 0.99, progress, 0.1).toFixed(6) : null,
      user_visible_latency_ms: latency,
      session_outcome: randomItem(SESSION_OUTCOMES),
      routing_time_ms: routingTime,
      retrieval_time_ms: retrievalTime,
      injection_time_ms: injectionTime,
      patterns_count: injectionOccurred ? randomInt(1, 12) : null,
      cache_hit: injectionOccurred ? Math.random() < withTrend(0.3, 0.6, progress, 0.15) : false,
      created_at: ts,
    });
  }

  return rows;
}

interface LatencyBreakdownRow {
  id: string;
  session_id: string;
  prompt_id: string;
  routing_time_ms: number | null;
  retrieval_time_ms: number | null;
  injection_time_ms: number | null;
  user_visible_latency_ms: number | null;
  cohort: string;
  cache_hit: boolean;
  created_at: Date;
}

function generateLatencyBreakdowns(count: number): LatencyBreakdownRow[] {
  const rows: LatencyBreakdownRow[] = [];

  for (let i = 0; i < count; i++) {
    const progress = i / (count - 1);
    const ts = timestampAtProgress(progress);
    const cohort = Math.random() < 0.6 ? 'treatment' : 'control';

    // Component latencies (trending downward = system improving)
    const routingMs = Math.round(withTrend(5, 35, progress, -0.1));
    const retrievalMs =
      cohort === 'treatment' ? Math.round(withTrend(15, 70, progress, -0.12)) : null;
    const injectionMs =
      cohort === 'treatment' ? Math.round(withTrend(3, 30, progress, -0.1)) : null;

    // Total visible latency = sum of components + base processing
    const baseProcessing = randomInt(50, 120);
    const totalLatency = baseProcessing + routingMs + (retrievalMs ?? 0) + (injectionMs ?? 0);

    const cacheHit =
      cohort === 'treatment' ? Math.random() < withTrend(0.25, 0.55, progress, 0.15) : false;

    rows.push({
      id: randomUUID(),
      session_id: randomUUID(),
      prompt_id: randomUUID(),
      routing_time_ms: routingMs,
      retrieval_time_ms: retrievalMs,
      injection_time_ms: injectionMs,
      user_visible_latency_ms: totalLatency,
      cohort,
      cache_hit: cacheHit,
      created_at: ts,
    });
  }

  return rows;
}

interface PatternHitRateRow {
  id: string;
  session_id: string;
  pattern_id: string;
  utilization_score: string | null;
  utilization_method: string | null;
  created_at: Date;
}

function generatePatternHitRates(count: number): PatternHitRateRow[] {
  const rows: PatternHitRateRow[] = [];

  for (let i = 0; i < count; i++) {
    const progress = i / (count - 1);
    const ts = timestampAtProgress(progress);
    const pattern = randomItem(PATTERN_IDS);

    // More commonly-used patterns have higher utilization
    const baseUtil =
      PATTERN_IDS.indexOf(pattern) < 5
        ? randomFloat(0.55, 0.95) // top-5 patterns: higher utilization
        : randomFloat(0.2, 0.75); // less common patterns: lower utilization

    // Apply upward trend
    const utilScore = clamp(baseUtil + (progress - 0.5) * 0.15, 0.05, 0.99);

    rows.push({
      id: randomUUID(),
      session_id: randomUUID(),
      pattern_id: pattern.id,
      utilization_score: utilScore.toFixed(6),
      utilization_method: randomItem(UTILIZATION_METHODS),
      created_at: ts,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// SQL insertion
// ---------------------------------------------------------------------------

function buildInsertSQL(
  table: string,
  columns: string[],
  rows: Record<string, unknown>[]
): { text: string; values: unknown[] } {
  const placeholders: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const row of rows) {
    const rowPlaceholders: string[] = [];
    for (const col of columns) {
      rowPlaceholders.push(`$${paramIndex++}`);
      values.push(row[col] ?? null);
    }
    placeholders.push(`(${rowPlaceholders.join(', ')})`);
  }

  const text = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders.join(', ')}`;
  return { text, values };
}

/**
 * Insert rows in batches to avoid exceeding PostgreSQL parameter limits.
 * pg allows up to 65535 parameters per query.
 */
async function batchInsert(
  pool: InstanceType<typeof Pool>,
  table: string,
  columns: string[],
  rows: Record<string, unknown>[],
  batchSize: number = 100
): Promise<number> {
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { text, values } = buildInsertSQL(table, columns, batch);
    await pool.query(text, values);
    inserted += batch.length;
  }

  return inserted;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== Effectiveness Data Seed Script ===\n');

  if (DRY_RUN) {
    console.log('[DRY RUN] No data will be written to the database.\n');
  }

  // Generate data
  console.log('Generating data...');

  const ieRows = generateInjectionEffectiveness(INJECTION_EFFECTIVENESS_COUNT);
  const lbRows = generateLatencyBreakdowns(LATENCY_BREAKDOWNS_COUNT);
  const phrRows = generatePatternHitRates(PATTERN_HIT_RATES_COUNT);

  console.log(`  injection_effectiveness: ${ieRows.length} rows`);
  console.log(`  latency_breakdowns:      ${lbRows.length} rows`);
  console.log(`  pattern_hit_rates:       ${phrRows.length} rows`);
  console.log(`  total:                   ${ieRows.length + lbRows.length + phrRows.length} rows`);

  if (DRY_RUN) {
    console.log('\n--- Sample injection_effectiveness row ---');
    console.log(JSON.stringify(ieRows[0], null, 2));
    console.log('\n--- Sample latency_breakdowns row ---');
    console.log(JSON.stringify(lbRows[0], null, 2));
    console.log('\n--- Sample pattern_hit_rates row ---');
    console.log(JSON.stringify(phrRows[0], null, 2));
    console.log('\n[DRY RUN] Done. Re-run without --dry-run to insert data.\n');
    return;
  }

  // Connect to database
  const connectionString = buildConnectionString();
  console.log(
    `\nConnecting to PostgreSQL at ${process.env.POSTGRES_HOST || 'DATABASE_URL'}:${process.env.POSTGRES_PORT || ''}...`
  );

  const pool = new Pool({ connectionString });

  try {
    // Verify connection
    const client = await pool.connect();
    console.log('Connected successfully.\n');
    client.release();

    // Truncate existing data (idempotent)
    console.log('Truncating existing data...');
    await pool.query('TRUNCATE TABLE injection_effectiveness CASCADE');
    await pool.query('TRUNCATE TABLE latency_breakdowns CASCADE');
    await pool.query('TRUNCATE TABLE pattern_hit_rates CASCADE');
    console.log('  Done.\n');

    // Insert injection_effectiveness
    const ieColumns = [
      'id',
      'session_id',
      'correlation_id',
      'cohort',
      'injection_occurred',
      'agent_name',
      'detection_method',
      'utilization_score',
      'utilization_method',
      'agent_match_score',
      'user_visible_latency_ms',
      'session_outcome',
      'routing_time_ms',
      'retrieval_time_ms',
      'injection_time_ms',
      'patterns_count',
      'cache_hit',
      'created_at',
    ];

    console.log('Inserting injection_effectiveness...');
    const ieInserted = await batchInsert(pool, 'injection_effectiveness', ieColumns, ieRows);
    console.log(`  Inserted ${ieInserted} rows.`);

    // Insert latency_breakdowns
    const lbColumns = [
      'id',
      'session_id',
      'prompt_id',
      'routing_time_ms',
      'retrieval_time_ms',
      'injection_time_ms',
      'user_visible_latency_ms',
      'cohort',
      'cache_hit',
      'created_at',
    ];

    console.log('Inserting latency_breakdowns...');
    const lbInserted = await batchInsert(pool, 'latency_breakdowns', lbColumns, lbRows);
    console.log(`  Inserted ${lbInserted} rows.`);

    // Insert pattern_hit_rates
    const phrColumns = [
      'id',
      'session_id',
      'pattern_id',
      'utilization_score',
      'utilization_method',
      'created_at',
    ];

    console.log('Inserting pattern_hit_rates...');
    const phrInserted = await batchInsert(pool, 'pattern_hit_rates', phrColumns, phrRows);
    console.log(`  Inserted ${phrInserted} rows.`);

    // Summary
    console.log('\n=== Seed Complete ===');
    console.log(`  injection_effectiveness: ${ieInserted} rows`);
    console.log(`  latency_breakdowns:      ${lbInserted} rows`);
    console.log(`  pattern_hit_rates:       ${phrInserted} rows`);
    console.log(`  total:                   ${ieInserted + lbInserted + phrInserted} rows`);
    console.log(`\n  Data spans the last ${DAYS_BACK} days with upward effectiveness trend.`);
    console.log('  Check the dashboard at http://localhost:3000/effectiveness\n');
  } catch (error) {
    console.error('\nError seeding effectiveness data:', error);
    throw error;
  } finally {
    await pool.end();
    console.log('Database connection closed.\n');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
