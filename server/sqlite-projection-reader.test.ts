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
      cost_usd REAL NOT NULL DEFAULT 0.0,
      cost_savings_usd REAL NOT NULL DEFAULT 0.0,
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
    CREATE TABLE IF NOT EXISTS node_service_registry (
      id TEXT PRIMARY KEY,
      service_name TEXT UNIQUE NOT NULL,
      service_url TEXT NOT NULL DEFAULT '',
      service_type TEXT,
      health_status TEXT DEFAULT 'unknown',
      metadata TEXT DEFAULT '{}',
      is_active INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT,
      projected_at TEXT
    );
    CREATE TABLE IF NOT EXISTS generation_events (
      id TEXT PRIMARY KEY,
      correlation_id TEXT UNIQUE NOT NULL,
      task_description TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      model_id TEXT NOT NULL DEFAULT '',
      endpoint_class TEXT NOT NULL DEFAULT '',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      total_latency_e2e_ms INTEGER NOT NULL DEFAULT 0,
      contract_passed INTEGER NOT NULL DEFAULT 0,
      cost_inference_usd REAL NOT NULL DEFAULT 0,
      endpoint_ref TEXT,
      resolved_endpoint TEXT,
      routing_source TEXT,
      projection_owner TEXT,
      projection_reducer_version TEXT,
      contract_yaml TEXT,
      handler_source TEXT,
      output_payload_sha256 TEXT,
      contract_sha256 TEXT,
      handler_sha256 TEXT,
      timestamp TEXT NOT NULL,
      created_at TEXT NOT NULL
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
      total_prompt_tokens: 300,
      total_completion_tokens: 130,
      total_tokens: 430,
      provisioned: true,
    });
    const byModel = rows[0]!.by_model as Record<string, unknown>[];
    expect(byModel).toHaveLength(1);
    expect(byModel[0]).toMatchObject({
      model_id: 'local',
      model_name: 'qwen3',
      prompt_tokens: 300,
      completion_tokens: 130,
      total_tokens: 430,
    });
  });

  it('reads delegation savings as a dashboard projection with live runtime tokens', () => {
    const db = createTestDb(dbPath);
    db.prepare(`
      INSERT INTO savings_estimates (session_id, event_timestamp, model_local, model_cloud_baseline, local_cost_usd, cloud_cost_usd, savings_usd, baseline_model, created_at)
      VALUES ('sess-1', 1000.0, 'qwen3', 'claude-3-5-sonnet', 0.02, 0.10, 0.08, 'claude-3-5-sonnet', 1000.0)
    `).run();
    db.prepare(`
      INSERT INTO delegation_events (
        correlation_id, session_id, task_type, delegated_to, model_name,
        quality_gate_passed, latency_ms, tokens_input, tokens_output,
        tokens_to_compliance, cost_usd, cost_savings_usd, created_at
      )
      VALUES ('corr-live', 'sess-live', 'test', 'local', 'qwen3-coder', 1, 3237, 144, 593, 737, 0.0, 0.009327, 2000.0)
    `).run();
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.delegation.savings.v1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cumulative_savings_usd: 0.089327,
      session_count: 2,
      provisioned: true,
    });
    const sessions = rows[0]!.sessions as Record<string, unknown>[];
    const live = sessions.find((s) => s.session_id === 'sess-live');
    expect(live).toMatchObject({
      task_type: 'test',
      model_name: 'qwen3-coder',
      prompt_tokens: 144,
      completion_tokens: 593,
      tokens_to_compliance: 737,
      savings_usd: 0.009327,
      latency_ms: 3237,
    });
  });

  it('deduplicates materialized and runtime savings rows by session', () => {
    const db = createTestDb(dbPath);
    db.prepare(`
      INSERT INTO savings_estimates (session_id, event_timestamp, model_local, model_cloud_baseline, local_cost_usd, cloud_cost_usd, savings_usd, baseline_model, created_at)
      VALUES ('sess-merged', 1000.0, 'qwen3-coder', 'claude-opus-4.1', 0.001, 0.010, 0.009, 'claude-opus-4.1', 1000.0)
    `).run();
    db.prepare(`
      INSERT INTO delegation_events (
        correlation_id, session_id, task_type, delegated_to, model_name,
        quality_gate_passed, latency_ms, tokens_input, tokens_output,
        tokens_to_compliance, cost_usd, cost_savings_usd, created_at
      )
      VALUES ('corr-merged', 'sess-merged', 'test', 'local', 'qwen3-coder', 1, 3237, 144, 593, 737, 0.0, 0.010, 2000.0)
    `).run();
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.delegation.savings.v1');

    expect(rows[0]).toMatchObject({
      cumulative_savings_usd: 0.009,
      session_count: 1,
    });
    const sessions = rows[0]!.sessions as Record<string, unknown>[];
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      session_id: 'sess-merged',
      savings_usd: 0.009,
      prompt_tokens: 144,
      completion_tokens: 593,
      tokens_to_compliance: 737,
      latency_ms: 3237,
      created_at: 2000,
    });
  });

  it('composes cost savings overview from live delegation runtime tokens', () => {
    const db = createTestDb(dbPath);
    db.prepare(`
      INSERT INTO delegation_events (
        correlation_id, session_id, task_type, delegated_to, model_name,
        quality_gate_passed, latency_ms, tokens_input, tokens_output,
        tokens_to_compliance, cost_usd, cost_savings_usd, created_at
      )
      VALUES ('corr-live', 'sess-live', 'test', 'local', 'qwen3-coder', 1, 3237, 144, 593, 737, 0.0, 0.009327, 2000.0)
    `).run();
    db.prepare(`
      INSERT INTO delegation_events (
        correlation_id, session_id, task_type, delegated_to, model_name,
        quality_gate_passed, latency_ms, tokens_input, tokens_output,
        tokens_to_compliance, cost_usd, cost_savings_usd, created_at
      )
      VALUES ('corr-doc', 'sess-doc', 'document', 'local', 'qwen3-coder', 1, 2109, 81, 384, 465, 0.0, 0.006003, 2100.0)
    `).run();
    db.prepare(`
      INSERT INTO savings_estimates (session_id, event_timestamp, model_local, model_cloud_baseline, local_cost_usd, cloud_cost_usd, savings_usd, baseline_model, created_at)
      VALUES ('sess-stale-estimate', 1000.0, 'qwen3-stale', 'claude-3-5-sonnet', 0.03, 0.25, 0.22, 'claude-3-5-sonnet', 1000.0)
    `).run();
    db.prepare(`
      INSERT INTO delegation_events (
        correlation_id, session_id, task_type, delegated_to, model_name,
        quality_gate_passed, latency_ms, tokens_input, tokens_output,
        tokens_to_compliance, cost_usd, cost_savings_usd, created_at
      )
      VALUES ('corr-zero', 'sess-zero', 'test', 'local', 'qwen3-zero', 1, 1000, 0, 0, 999, 0.10, 0.50, 2200.0)
    `).run();
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.cost.savings-overview.v1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      window: '24h',
      total_cost_usd: 0,
      total_baseline_cost_usd: 0.01533,
      total_savings_usd: 0.01533,
      savings_rate: 1,
      tokens_total: 1202,
      tokens_to_compliance: 1202,
      local_token_pct: 1,
      provisioned: true,
    });
    const overviewRows = rows[0]!.rows as Record<string, unknown>[];
    expect(overviewRows).toHaveLength(1);
    expect(overviewRows[0]).toMatchObject({
      display_name: 'qwen3-coder',
      execution_mode: 'delegated',
      task_count: 2,
      tokens_total: 1202,
      cost_usd: 0,
      savings_usd: 0.01533,
    });
    expect(rows[0]!.warnings).toEqual(['Omitted 2 delegation rows without token telemetry.']);
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
    expect(rows[0]).toMatchObject({ total_delegations: 3, provisioned: true });
    const byModel = rows[0]!.by_model as Record<string, unknown>[];
    expect(byModel).toHaveLength(1);
    expect(byModel[0]).toMatchObject({ model_name: 'qwen3', total_count: 3 });
    const routingRows = rows[0]!.rows as Record<string, unknown>[];
    expect(routingRows).toHaveLength(1);
    expect(routingRows[0]).toMatchObject({ model_name: 'qwen3', task_type: 'code_review', count: 3 });
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
    expect(rows[0]).toMatchObject({
      overall_pass_rate: 0.5,
      total_passed: 1,
      total_failed: 1,
      total_checks: 2,
      provisioned: true,
    });
    const byCheckType = rows[0]!.by_check_type as Record<string, unknown>[];
    expect(byCheckType.length).toBeGreaterThan(0);
    const unknownBucket = byCheckType.find((b) => b.check_type === 'unknown');
    expect(unknownBucket).toMatchObject({ passed: 1, failed: 1, total: 2, pass_rate: 0.5 });
  });

  it('reads live work events from bus envelopes and delegation runtime rows', () => {
    const db = createTestDb(dbPath);
    db.prepare(`INSERT INTO delegation_event_log (envelope, created_at) VALUES (?, ?)`).run(
      '{"type":"ROUTING","topic":"onex.cmd.route.v1","source":"omnimarket","summary":"Routing qwen3","correlation_id":"corr-bus","payload":{"model":"qwen3"}}',
      1000.0,
    );
    db.prepare(`
      INSERT INTO delegation_events (
        correlation_id, task_type, delegated_to, model_name, quality_gate_passed,
        latency_ms, tokens_input, tokens_output, cost_savings_usd, created_at
      )
      VALUES ('corr-runtime', 'test', 'local', 'qwen3-coder', 1, 505, 60, 98, 0.00165, 2000.0)
    `).run();
    db.prepare(`
      INSERT INTO delegation_events (
        correlation_id, task_type, delegated_to, model_name, quality_gate_passed,
        latency_ms, tokens_input, tokens_output, cost_savings_usd, input_redaction_policy, created_at
      )
      VALUES ('corr-stub', 'test', 'local', 'qwen3-coder', 1, 100, 1, 1, 0.1, 'synthetic_demo', 3000.0)
    `).run();
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.live-events.v1');

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.correlation_id === 'corr-stub')).toBeUndefined();
    expect(rows[0]).toMatchObject({
      id: 'delegation-corr-runtime',
      type: 'DELEGATION_COMPLETED',
      source: 'delegation_runtime',
      topic: 'onex.evt.delegation.completed.v1',
      correlation_id: 'corr-runtime',
    });
    expect(rows[0]!.summary).toContain('158 tokens');
    expect(rows[1]).toMatchObject({
      id: 'corr-bus',
      type: 'ROUTING',
      source: 'omnimarket',
      topic: 'onex.cmd.route.v1',
      correlation_id: 'corr-bus',
      summary: 'Routing qwen3',
    });
  });

  it('reads MCP tool rows from active node_service_registry metadata', () => {
    const db = createTestDb(dbPath);
    db.prepare(`
      INSERT INTO node_service_registry (
        id,
        service_name,
        service_type,
        health_status,
        metadata,
        is_active,
        created_at,
        updated_at,
        projected_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'tool-1',
      'node_sentiment_classifier',
      'mcp_tool',
      'active',
      JSON.stringify({
        description: 'Classify customer review sentiment.',
        modelId: 'gemini-2.0-flash',
        correlationId: 'corr-mcp-1',
      }),
      1,
      '2026-05-20T08:00:00.000Z',
      '2026-05-20T08:05:00.000Z',
      '2026-05-20T08:05:00.000Z',
    );
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.mcp-tools.v1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'node_sentiment_classifier',
      description: 'Classify customer review sentiment.',
      registeredAt: '2026-05-20T08:00:00.000Z',
      status: 'active',
      modelId: 'gemini-2.0-flash',
      correlationId: 'corr-mcp-1',
    });
  });

  it('reads hackathon pipeline events from generation_events', () => {
    const db = createTestDb(dbPath);
    db.prepare(`
      INSERT INTO generation_events (
        id,
        correlation_id,
        task_description,
        provider,
        model_id,
        endpoint_ref,
        resolved_endpoint,
        routing_source,
        projection_owner,
        projection_reducer_version,
        contract_yaml,
        handler_source,
        output_payload_sha256,
        contract_passed,
        timestamp,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'gen-1',
      'corr-gen-1',
      'Build an email validator node',
      'openai',
      'gpt-5-mini',
      'contracts/endpoints/sea-generation.yaml#openai',
      'https://api.openai.example/v1/responses',
      'runtime-routing-authority',
      'node_projection_generation_events',
      '078',
      'kind: node\nname: email-validator\nspec:\n  entrypoint: handler.run\n',
      'export async function run(input) {\n  return input.email.includes("@");\n}\n',
      'sha256-output',
      1,
      '2026-05-20T08:10:00.000Z',
      '2026-05-20T08:10:00.000Z',
    );
    db.close();

    const reader = new SqliteProjectionReader({ dbPath });
    const rows = reader.readProjection('onex.snapshot.projection.hackathon_pipeline_events.v1');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'corr-gen-1-completed',
      type: 'success',
      timestamp: '2026-05-20T08:10:00.000Z',
      source: 'node_generation_consumer',
      message: 'Node generation completed: Build an email validator node',
      correlationId: 'corr-gen-1',
      taskDescription: 'Build an email validator node',
      selectedProvider: 'openai',
      selectedModel: 'gpt-5-mini',
      endpointRef: 'contracts/endpoints/sea-generation.yaml#openai',
      resolvedEndpoint: 'https://api.openai.example/v1/responses',
      routingSource: 'runtime-routing-authority',
      projectionOwner: 'node_projection_generation_events',
      projectionReducerVersion: '078',
      contractYaml: 'kind: node\nname: email-validator\nspec:\n  entrypoint: handler.run\n',
      handlerSource: 'export async function run(input) {\n  return input.email.includes("@");\n}\n',
      outputPayloadSha256: 'sha256-output',
    });
    expect(JSON.parse(String(rows[0].payload))).toMatchObject({
      contractYaml: 'kind: node\nname: email-validator\nspec:\n  entrypoint: handler.run\n',
      handlerSource: 'export async function run(input) {\n  return input.email.includes("@");\n}\n',
    });
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
