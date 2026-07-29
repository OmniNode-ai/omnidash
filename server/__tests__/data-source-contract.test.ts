import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadDataSourceConfig, loadRuntimeContract, loadRuntimeEdgeConfig } from '../data-source-contract.js';

describe('loadDataSourceConfig', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.OMNIDASH_DATA_SOURCE = process.env.OMNIDASH_DATA_SOURCE;
    savedEnv.OMNIDASH_BRIDGE_URL = process.env.OMNIDASH_BRIDGE_URL;
    savedEnv.OMNIDASH_SQLITE_DB_PATH = process.env.OMNIDASH_SQLITE_DB_PATH;
    savedEnv.OMNIDASH_ANALYTICS_DB_URL = process.env.OMNIDASH_ANALYTICS_DB_URL;
    savedEnv.OMNIDASH_RUNTIME_EDGE_URL = process.env.OMNIDASH_RUNTIME_EDGE_URL;
    savedEnv.OMNIDASH_RUNTIME_EDGE_TIMEOUT_MS = process.env.OMNIDASH_RUNTIME_EDGE_TIMEOUT_MS;
    delete process.env.OMNIDASH_DATA_SOURCE;
    delete process.env.OMNIDASH_BRIDGE_URL;
    delete process.env.OMNIDASH_SQLITE_DB_PATH;
    delete process.env.OMNIDASH_ANALYTICS_DB_URL;
    delete process.env.OMNIDASH_RUNTIME_EDGE_URL;
    delete process.env.OMNIDASH_RUNTIME_EDGE_TIMEOUT_MS;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('returns contract.yaml defaults when no env vars are set', () => {
    const cfg = loadDataSourceConfig();
    // OMN-14642: deployed default is http (projection-api proxy), NOT direct
    // postgres — the bridge must not hold a direct RDS connection.
    expect(cfg.mode).toBe('http');
    expect(cfg.url).toBe('');
    expect(cfg.wsUrl).toBe('ws://localhost:3002/ws');
    expect(cfg.sqliteDbPath).toMatch(/\.omninode[/\\]delegation[/\\]delegation\.sqlite$/);
    // OMN-14642: RDS/Postgres credential removed from the bridge default; the
    // base contract declares no secret ref, so both resolve to null.
    expect(cfg.postgresDatabaseUrlSecretRef).toBeNull();
    expect(cfg.postgresDatabaseUrl).toBeNull();
  });

  it('honors OMNIDASH_DATA_SOURCE env override', () => {
    process.env.OMNIDASH_DATA_SOURCE = 'postgres';
    const cfg = loadDataSourceConfig();
    expect(cfg.mode).toBe('postgres');
  });

  it('honors OMNIDASH_BRIDGE_URL env override', () => {
    process.env.OMNIDASH_BRIDGE_URL = 'http://custom-host:3002';
    const cfg = loadDataSourceConfig();
    expect(cfg.url).toBe('http://custom-host:3002');
  });

  it('honors OMNIDASH_SQLITE_DB_PATH env override', () => {
    process.env.OMNIDASH_SQLITE_DB_PATH = '/tmp/test.sqlite';
    const cfg = loadDataSourceConfig();
    expect(cfg.sqliteDbPath).toBe('/tmp/test.sqlite');
  });

  it('does not resolve OMNIDASH_ANALYTICS_DB_URL unless the contract declares that specific ref', () => {
    process.env.OMNIDASH_ANALYTICS_DB_URL = 'postgresql://projection:secret@db:5432/omnidash_analytics';
    const cfg = loadDataSourceConfig();
    // OMN-14642: the base contract declares NO secret ref (emptied so the bridge
    // holds no RDS credential by default), so OMNIDASH_ANALYTICS_DB_URL is
    // irrelevant and postgresDatabaseUrl stays null.
    expect(cfg.postgresDatabaseUrlSecretRef).toBeNull();
    expect(cfg.postgresDatabaseUrl).toBeNull();
  });

  it('expands tilde in sqlite_db_path', () => {
    const cfg = loadDataSourceConfig();
    expect(cfg.sqliteDbPath).not.toMatch(/^~/);
    expect(cfg.sqliteDbPath).toMatch(/\.omninode/);
  });

  it('deep-merges contract.local.yaml over contract.yaml without resetting unrelated defaults', () => {
    const dir = mkdtempSync(join(tmpdir(), 'omnidash-contract-'));
    try {
      const basePath = join(dir, 'contract.yaml');
      const overlayPath = join(dir, 'contract.local.yaml');
      writeFileSync(basePath, `
data_source:
  default: postgres
  url: "http://base:3002"
  ws_url: "ws://base:3002/ws"
  sqlite_db_path: "~/.omninode/delegation/delegation.sqlite"
  postgres_database_url_secret_ref: ""
runtime_edge:
  url: ""
  timeout_ms: "300000"
`);
      writeFileSync(overlayPath, `
data_source:
  postgres_database_url_secret_ref: "env:OMNIDASH_ANALYTICS_DB_URL"
runtime_edge:
  url: "http://runtime:8085"
`);
      process.env.OMNIDASH_ANALYTICS_DB_URL =
        'postgresql://projection:secret@db:5432/omnidash_analytics';

      const cfg = loadRuntimeContract(basePath, overlayPath);
      const dsCfg = loadDataSourceConfig(basePath, overlayPath);

      expect(cfg.data_source.default).toBe('postgres');
      expect(cfg.data_source.url).toBe('http://base:3002');
      expect(cfg.data_source.postgres_database_url_secret_ref).toBe('env:OMNIDASH_ANALYTICS_DB_URL');
      expect(dsCfg.postgresDatabaseUrlSecretRef).toBe('env:OMNIDASH_ANALYTICS_DB_URL');
      expect(dsCfg.postgresDatabaseUrl).toBe(
        'postgresql://projection:secret@db:5432/omnidash_analytics',
      );
      expect(cfg.runtime_edge.url).toBe('http://runtime:8085');
      expect(cfg.runtime_edge.timeout_ms).toBe('300000');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('has no dashboard-owned Kafka producer module', () => {
    expect(existsSync(join(process.cwd(), 'server', 'kafka-producer.ts'))).toBe(false);
  });

  it('declares the unified live-events projection used by the System Event Stream', () => {
    const contract = readFileSync(join(process.cwd(), 'contract.yaml'), 'utf8');

    expect(contract).toContain('topic: "onex.snapshot.projection.live-events.v1"');
    expect(contract).toContain('table: "live_events"');
    expect(contract).toContain(
      'source_contract: "omnimarket/src/omnimarket/nodes/node_projection_live_events/contract.yaml"',
    );
  });

  it('honors runtime edge env overrides', () => {
    process.env.OMNIDASH_RUNTIME_EDGE_URL = 'http://runtime-edge:8085/';
    process.env.OMNIDASH_RUNTIME_EDGE_TIMEOUT_MS = '120000';

    const cfg = loadRuntimeEdgeConfig();

    expect(cfg.url).toBe('http://runtime-edge:8085');
    expect(cfg.timeoutMs).toBe(120000);
  });
});
