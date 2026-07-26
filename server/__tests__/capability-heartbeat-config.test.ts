import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadCapabilityHeartbeatConfig } from '../data-source-contract.js';

// loadCapabilityHeartbeatConfig reads the contract.yaml defaults (heartbeat
// enabled, 30s) but is gated on a configured runtime edge, and the interval/enabled
// flag are env-overridable for lane tuning. These tests exercise the env-driven
// surface against the singleton contract.
describe('loadCapabilityHeartbeatConfig (W-cap)', () => {
  const KEYS = [
    'OMNIDASH_RUNTIME_EDGE_URL',
    'OMNIDASH_RENDERER_CAPABILITY_HEARTBEAT_ENABLED',
    'OMNIDASH_RENDERER_CAPABILITY_HEARTBEAT_INTERVAL_MS',
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('is disabled when no runtime edge is configured', () => {
    // No runtime edge env, base contract has none → cannot dispatch.
    const cfg = loadCapabilityHeartbeatConfig();
    expect(cfg.enabled).toBe(false);
  });

  it('is enabled with the default 30s interval once a runtime edge is configured', () => {
    process.env.OMNIDASH_RUNTIME_EDGE_URL = 'http://localhost:8085';
    const cfg = loadCapabilityHeartbeatConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.intervalMs).toBe(30_000);
  });

  it('honors the interval env override', () => {
    process.env.OMNIDASH_RUNTIME_EDGE_URL = 'http://localhost:8085';
    process.env.OMNIDASH_RENDERER_CAPABILITY_HEARTBEAT_INTERVAL_MS = '15000';
    const cfg = loadCapabilityHeartbeatConfig();
    expect(cfg.intervalMs).toBe(15_000);
  });

  it('honors the enabled=false env override even with a runtime edge', () => {
    process.env.OMNIDASH_RUNTIME_EDGE_URL = 'http://localhost:8085';
    process.env.OMNIDASH_RENDERER_CAPABILITY_HEARTBEAT_ENABLED = 'false';
    const cfg = loadCapabilityHeartbeatConfig();
    expect(cfg.enabled).toBe(false);
  });

  it('throws on a non-positive interval (fail-fast on misconfiguration)', () => {
    process.env.OMNIDASH_RUNTIME_EDGE_URL = 'http://localhost:8085';
    process.env.OMNIDASH_RENDERER_CAPABILITY_HEARTBEAT_INTERVAL_MS = '0';
    expect(() => loadCapabilityHeartbeatConfig()).toThrow(/positive integer/);
  });
});
