import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadDataSourceConfig, loadEventBusConfig, loadRuntimeContract } from '../data-source-contract.js';

describe('loadDataSourceConfig', () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.OMNIDASH_DATA_SOURCE = process.env.OMNIDASH_DATA_SOURCE;
    savedEnv.OMNIDASH_BRIDGE_URL = process.env.OMNIDASH_BRIDGE_URL;
    savedEnv.OMNIDASH_SQLITE_DB_PATH = process.env.OMNIDASH_SQLITE_DB_PATH;
    savedEnv.OMNIDASH_ANALYTICS_DB_URL = process.env.OMNIDASH_ANALYTICS_DB_URL;
    savedEnv.OMNIDASH_EVENT_BUS_BOOTSTRAP_SERVERS = process.env.OMNIDASH_EVENT_BUS_BOOTSTRAP_SERVERS;
    savedEnv.OMNIDASH_EVENT_BUS_CLIENT_ID = process.env.OMNIDASH_EVENT_BUS_CLIENT_ID;
    delete process.env.OMNIDASH_DATA_SOURCE;
    delete process.env.OMNIDASH_BRIDGE_URL;
    delete process.env.OMNIDASH_SQLITE_DB_PATH;
    delete process.env.OMNIDASH_ANALYTICS_DB_URL;
    delete process.env.OMNIDASH_EVENT_BUS_BOOTSTRAP_SERVERS;
    delete process.env.OMNIDASH_EVENT_BUS_CLIENT_ID;
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
event_bus:
  bootstrap_servers: ""
  client_id: "omnidash-server"
`);
      writeFileSync(overlayPath, `
data_source:
  postgres_database_url_secret_ref: "env:OMNIDASH_ANALYTICS_DB_URL"
event_bus:
  bootstrap_servers: "192.168.86.201:39092"
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
      expect(cfg.event_bus.bootstrap_servers).toBe('192.168.86.201:39092');
      expect(cfg.event_bus.client_id).toBe('omnidash-server');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not use legacy KAFKA_BROKERS in the producer config path', () => {
    const source = readFileSync(join(process.cwd(), 'server', 'kafka-producer.ts'), 'utf8');
    expect(source).not.toContain('KAFKA_BROKERS');
  });

  it('honors event bus env overrides without mutating contract.local.yaml', () => {
    process.env.OMNIDASH_EVENT_BUS_BOOTSTRAP_SERVERS =
      '100.109.203.94:39092, 192.0.2.10:39092';
    process.env.OMNIDASH_EVENT_BUS_CLIENT_ID = 'omnidash-stability-proof';

    const cfg = loadEventBusConfig();

    expect(cfg.bootstrapServers).toEqual(['100.109.203.94:39092', '192.0.2.10:39092']);
    expect(cfg.clientId).toBe('omnidash-stability-proof');
  });
});
