import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadCapabilityHeartbeatConfig } from '../data-source-contract.js';

// loadCapabilityHeartbeatConfig reads the contract.yaml defaults (heartbeat
// enabled, 30s) but is gated on a configured broker, and the interval/enabled
// flag are env-overridable for lane tuning. These tests exercise the env-driven
// surface against the singleton contract.
describe('loadCapabilityHeartbeatConfig (W-cap)', () => {
  const KEYS = [
    'OMNIDASH_EVENT_BUS_BOOTSTRAP_SERVERS',
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

  it('is disabled when no event_bus broker is configured (needs a broker)', () => {
    // No bootstrap servers env, base contract has none → cannot publish.
    const cfg = loadCapabilityHeartbeatConfig();
    expect(cfg.enabled).toBe(false);
  });

  it('is enabled with the default 30s interval once a broker is configured', () => {
    process.env.OMNIDASH_EVENT_BUS_BOOTSTRAP_SERVERS = 'localhost:9092';
    const cfg = loadCapabilityHeartbeatConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.intervalMs).toBe(30_000);
  });

  it('honors the interval env override', () => {
    process.env.OMNIDASH_EVENT_BUS_BOOTSTRAP_SERVERS = 'localhost:9092';
    process.env.OMNIDASH_RENDERER_CAPABILITY_HEARTBEAT_INTERVAL_MS = '15000';
    const cfg = loadCapabilityHeartbeatConfig();
    expect(cfg.intervalMs).toBe(15_000);
  });

  it('honors the enabled=false env override even with a broker', () => {
    process.env.OMNIDASH_EVENT_BUS_BOOTSTRAP_SERVERS = 'localhost:9092';
    process.env.OMNIDASH_RENDERER_CAPABILITY_HEARTBEAT_ENABLED = 'false';
    const cfg = loadCapabilityHeartbeatConfig();
    expect(cfg.enabled).toBe(false);
  });

  it('throws on a non-positive interval (fail-fast on misconfiguration)', () => {
    process.env.OMNIDASH_EVENT_BUS_BOOTSTRAP_SERVERS = 'localhost:9092';
    process.env.OMNIDASH_RENDERER_CAPABILITY_HEARTBEAT_INTERVAL_MS = '0';
    expect(() => loadCapabilityHeartbeatConfig()).toThrow(/positive integer/);
  });
});
