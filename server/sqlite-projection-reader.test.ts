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
      latency_ms INTEGER,
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

  it('returns empty savings summary when table is empty', () => {
    const db = createTestDb(dbPath);
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.savings.summary.v1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_count: 0 });
  });
});
