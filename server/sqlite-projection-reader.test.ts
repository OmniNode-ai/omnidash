import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SqliteProjectionReader } from './sqlite-projection-reader.js';

function createTestDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS delegation_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      correlation_id TEXT NOT NULL UNIQUE,
      session_id TEXT,
      tool_use_id TEXT,
      hook_name TEXT,
      task_type TEXT NOT NULL DEFAULT '',
      delegated_to TEXT NOT NULL DEFAULT '',
      model_name TEXT NOT NULL DEFAULT '',
      quality_gate_passed INTEGER NOT NULL DEFAULT 0,
      quality_gate_detail TEXT,
      quality_gates_checked INTEGER NOT NULL DEFAULT 0,
      quality_gates_failed INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER,
      tokens_input INTEGER NOT NULL DEFAULT 0,
      tokens_output INTEGER NOT NULL DEFAULT 0,
      tokens_to_compliance INTEGER NOT NULL DEFAULT 0,
      input_hash TEXT,
      input_redaction_policy TEXT NOT NULL DEFAULT 'hash_only',
      contract_version TEXT NOT NULL DEFAULT 'v1',
      created_at REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS llm_call_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      input_hash TEXT NOT NULL UNIQUE,
      model_id TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL DEFAULT 0.0,
      usage_source TEXT NOT NULL DEFAULT 'estimated',
      token_provenance TEXT,
      created_at REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS savings_estimates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      event_timestamp REAL NOT NULL,
      model_local TEXT NOT NULL,
      model_cloud_baseline TEXT NOT NULL,
      local_cost_usd REAL NOT NULL DEFAULT 0.0,
      cloud_cost_usd REAL NOT NULL DEFAULT 0.0,
      savings_usd REAL NOT NULL DEFAULT 0.0,
      baseline_model TEXT NOT NULL,
      pricing_manifest_version TEXT NOT NULL DEFAULT 'v1',
      savings_method TEXT NOT NULL DEFAULT 'token_diff',
      usage_source TEXT NOT NULL DEFAULT 'estimated',
      created_at REAL NOT NULL,
      UNIQUE (session_id, event_timestamp, model_local, model_cloud_baseline)
    );
    CREATE TABLE IF NOT EXISTS delegation_event_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      envelope TEXT NOT NULL,
      created_at REAL NOT NULL
    );
  `);
  return db;
}

describe('SqliteProjectionReader', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'omnidash-sqlite-test-'));
    dbPath = join(tmpDir, 'delegation.sqlite');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns [] when the DB file does not exist', () => {
    const reader = new SqliteProjectionReader({ dbPath: join(tmpDir, 'nonexistent.sqlite') });
    expect(reader.readProjection('onex.snapshot.projection.delegation.decisions.v1')).toEqual([]);
  });

  it('returns [] for an unknown topic', () => {
    const db = createTestDb(dbPath);
    db.close();
    const reader = new SqliteProjectionReader({ dbPath });
    expect(reader.readProjection('onex.snapshot.projection.unknown.v1')).toEqual([]);
  });

  it('reads delegation_events rows for decisions topic', () => {
    const db = createTestDb(dbPath);
    db.prepare(`
      INSERT INTO delegation_events (correlation_id, task_type, delegated_to, model_name, quality_gate_passed, created_at)
      VALUES ('corr-1', 'code_review', 'local', 'qwen3', 1, 1000.0)
    `).run();
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.delegation.decisions.v1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      correlation_id: 'corr-1',
      task_type: 'code_review',
      delegated_to: 'local',
      model_name: 'qwen3',
      quality_gate_passed: 1,
    });
  });

  it('reads delegation summary aggregates', () => {
    const db = createTestDb(dbPath);
    db.prepare(`
      INSERT INTO delegation_events (correlation_id, task_type, delegated_to, model_name, quality_gate_passed, latency_ms, created_at)
      VALUES ('corr-1', 'task', 'local', 'qwen3', 1, 200, 1000.0)
    `).run();
    db.prepare(`
      INSERT INTO delegation_events (correlation_id, task_type, delegated_to, model_name, quality_gate_passed, latency_ms, created_at)
      VALUES ('corr-2', 'task', 'cloud', 'claude', 0, 400, 2000.0)
    `).run();
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.delegation.summary.v1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      total_events: 2,
      quality_passed_count: 1,
      quality_failed_count: 1,
    });
    expect(Number(rows[0]!.avg_latency_ms)).toBe(300);
  });

  it('reads llm_call_metrics rows for llm_cost topic', () => {
    const db = createTestDb(dbPath);
    db.prepare(`
      INSERT INTO llm_call_metrics (input_hash, model_id, prompt_tokens, completion_tokens, estimated_cost_usd, created_at)
      VALUES ('hash-abc', 'qwen3-30b', 1000, 200, 0.05, 1000.0)
    `).run();
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.llm_cost.v1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      input_hash: 'hash-abc',
      model_id: 'qwen3-30b',
      prompt_tokens: 1000,
      estimated_cost_usd: 0.05,
    });
  });

  it('reads savings_estimates rows for savings topic', () => {
    const db = createTestDb(dbPath);
    db.prepare(`
      INSERT INTO savings_estimates (session_id, event_timestamp, model_local, model_cloud_baseline, local_cost_usd, cloud_cost_usd, savings_usd, baseline_model, created_at)
      VALUES ('sess-1', 1000.0, 'qwen3', 'claude-3-5-sonnet', 0.02, 0.10, 0.08, 'claude-3-5-sonnet', 1000.0)
    `).run();
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.savings.v1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      session_id: 'sess-1',
      model_local: 'qwen3',
      savings_usd: 0.08,
    });
  });

  it('reads savings summary aggregates', () => {
    const db = createTestDb(dbPath);
    db.prepare(`
      INSERT INTO savings_estimates (session_id, event_timestamp, model_local, model_cloud_baseline, local_cost_usd, cloud_cost_usd, savings_usd, baseline_model, created_at)
      VALUES ('sess-1', 1000.0, 'qwen3', 'claude', 0.02, 0.10, 0.08, 'claude', 1000.0)
    `).run();
    db.prepare(`
      INSERT INTO savings_estimates (session_id, event_timestamp, model_local, model_cloud_baseline, local_cost_usd, cloud_cost_usd, savings_usd, baseline_model, created_at)
      VALUES ('sess-2', 2000.0, 'qwen3', 'claude', 0.03, 0.12, 0.09, 'claude', 2000.0)
    `).run();
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.savings.summary.v1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_count: 2 });
    expect(Number(rows[0]!.total_savings_usd)).toBeCloseTo(0.17);
    expect(Number(rows[0]!.total_local_cost_usd)).toBeCloseTo(0.05);
  });

  it('returns zeros (not null) for savings summary when table is empty', () => {
    const db = createTestDb(dbPath);
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.savings.summary.v1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event_count: 0,
      total_savings_usd: 0,
      total_local_cost_usd: 0,
      total_cloud_cost_usd: 0,
    });
  });

  it('returns zeros (not null) for delegation summary when table is empty', () => {
    const db = createTestDb(dbPath);
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.delegation.summary.v1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      total_events: 0,
      quality_passed_count: 0,
      quality_failed_count: 0,
      avg_latency_ms: 0,
      latest_event_at: 0,
    });
  });

  it('reads cost summary aggregate from llm_call_metrics', () => {
    const db = createTestDb(dbPath);
    db.prepare(`
      INSERT INTO llm_call_metrics (input_hash, model_id, prompt_tokens, completion_tokens, estimated_cost_usd, created_at)
      VALUES ('hash-1', 'qwen3-30b', 100, 50, 0.01, 1000.0)
    `).run();
    db.prepare(`
      INSERT INTO llm_call_metrics (input_hash, model_id, prompt_tokens, completion_tokens, estimated_cost_usd, created_at)
      VALUES ('hash-2', 'qwen3-30b', 200, 100, 0.02, 2000.0)
    `).run();
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.cost.summary.v1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ call_count: 2, total_prompt_tokens: 300, total_completion_tokens: 150 });
    expect(Number(rows[0]!.total_cost_usd)).toBeCloseTo(0.03);
  });

  it('returns zeros for cost summary when llm_call_metrics is empty', () => {
    const db = createTestDb(dbPath);
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.cost.summary.v1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ call_count: 0, total_prompt_tokens: 0, total_cost_usd: 0 });
  });

  it('reads per-model token usage from llm_call_metrics', () => {
    const db = createTestDb(dbPath);
    db.prepare(`
      INSERT INTO llm_call_metrics (input_hash, model_id, prompt_tokens, completion_tokens, estimated_cost_usd, usage_source, created_at)
      VALUES ('hash-a', 'qwen3-30b', 100, 50, 0.01, 'measured', 1000.0)
    `).run();
    db.prepare(`
      INSERT INTO llm_call_metrics (input_hash, model_id, prompt_tokens, completion_tokens, estimated_cost_usd, usage_source, created_at)
      VALUES ('hash-b', 'deepseek-r1', 200, 80, 0.02, 'estimated', 2000.0)
    `).run();
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.cost.token_usage.v1');

    expect(rows.length).toBeGreaterThanOrEqual(2);
    const qwenRow = rows.find((r) => r['model_id'] === 'qwen3-30b');
    expect(qwenRow).toBeDefined();
    expect(qwenRow).toMatchObject({ total_prompt_tokens: 100, total_completion_tokens: 50, total_tokens: 150 });
  });

  it('reads per-model token usage from delegation_events', () => {
    const db = createTestDb(dbPath);
    db.prepare(`
      INSERT INTO delegation_events (correlation_id, task_type, delegated_to, model_name, quality_gate_passed, tokens_input, tokens_output, tokens_to_compliance, created_at)
      VALUES ('corr-1', 'code_review', 'local', 'qwen3', 1, 100, 50, 5, 1000.0)
    `).run();
    db.prepare(`
      INSERT INTO delegation_events (correlation_id, task_type, delegated_to, model_name, quality_gate_passed, tokens_input, tokens_output, tokens_to_compliance, created_at)
      VALUES ('corr-2', 'code_review', 'local', 'qwen3', 1, 200, 80, 0, 2000.0)
    `).run();
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.delegation.token-usage.v1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      model_alias: 'local',
      model_name: 'qwen3',
      delegation_count: 2,
      total_tokens_input: 300,
      total_tokens_output: 130,
      total_tokens: 430,
      total_tokens_to_compliance: 5,
    });
  });

  it('reads delegation savings rows', () => {
    const db = createTestDb(dbPath);
    db.prepare(`
      INSERT INTO savings_estimates (session_id, event_timestamp, model_local, model_cloud_baseline, local_cost_usd, cloud_cost_usd, savings_usd, baseline_model, created_at)
      VALUES ('sess-1', 1000.0, 'qwen3', 'claude-3-5-sonnet', 0.02, 0.10, 0.08, 'claude-3-5-sonnet', 1000.0)
    `).run();
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.delegation.savings.v1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ session_id: 'sess-1', savings_usd: 0.08 });
  });

  it('reads delegation model routing grouped by model and task_type', () => {
    const db = createTestDb(dbPath);
    for (let i = 0; i < 3; i++) {
      db.prepare(`
        INSERT INTO delegation_events (correlation_id, task_type, delegated_to, model_name, quality_gate_passed, latency_ms, created_at)
        VALUES (?, 'code_review', 'local', 'qwen3', 1, 200, ${1000 + i}.0)
      `).run(`corr-${i}`);
    }
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.delegation.model-routing.v1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ model_alias: 'local', task_type: 'code_review', event_count: 3, quality_passed: 3 });
  });

  it('reads delegation quality gate grouped by detail', () => {
    const db = createTestDb(dbPath);
    db.prepare(`
      INSERT INTO delegation_events (correlation_id, task_type, delegated_to, model_name, quality_gate_passed, quality_gate_detail, quality_gates_checked, quality_gates_failed, created_at)
      VALUES ('corr-1', 'review', 'local', 'qwen3', 1, 'sql_injection:pass', 2, 0, 1000.0)
    `).run();
    db.prepare(`
      INSERT INTO delegation_events (correlation_id, task_type, delegated_to, model_name, quality_gate_passed, quality_gate_detail, quality_gates_checked, quality_gates_failed, created_at)
      VALUES ('corr-2', 'review', 'local', 'qwen3', 0, 'sql_injection:pass', 2, 1, 2000.0)
    `).run();
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.delegation.quality-gate.v1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ check_detail: 'sql_injection:pass', total_checks: 2, passed_count: 1, failed_count: 1 });
  });

  it('reads live events from delegation_event_log', () => {
    const db = createTestDb(dbPath);
    db.prepare(`INSERT INTO delegation_event_log (envelope, created_at) VALUES (?, ?)`).run('{"type":"ROUTING","model":"qwen3"}', 1000.0);
    db.prepare(`INSERT INTO delegation_event_log (envelope, created_at) VALUES (?, ?)`).run('{"type":"DECISION","model":"deepseek"}', 2000.0);
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.live-events.v1');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ envelope: '{"type":"DECISION","model":"deepseek"}' });
  });

  it('returns [] for topics with no backing table (baselines, overnight, registration)', () => {
    const db = createTestDb(dbPath);
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    expect(reader.readProjection('onex.snapshot.projection.baselines.roi.v1')).toEqual([]);
    expect(reader.readProjection('onex.snapshot.projection.baselines.quality.v1')).toEqual([]);
    expect(reader.readProjection('onex.snapshot.projection.overnight.v1')).toEqual([]);
    expect(reader.readProjection('onex.snapshot.projection.registration.v1')).toEqual([]);
  });
});
