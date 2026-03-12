import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('bus-config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.KAFKA_BOOTSTRAP_SERVERS;
    delete process.env.KAFKA_BROKERS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('resolveBrokers', () => {
    it('returns KAFKA_BOOTSTRAP_SERVERS when set alone', async () => {
      process.env.KAFKA_BOOTSTRAP_SERVERS = 'localhost:19092';
      const { resolveBrokers } = await import('../bus-config');
      expect(resolveBrokers()).toEqual(['localhost:19092']);
    });

    it('KAFKA_BOOTSTRAP_SERVERS takes precedence over KAFKA_BROKERS', async () => {
      process.env.KAFKA_BOOTSTRAP_SERVERS = 'localhost:19092';
      process.env.KAFKA_BROKERS = 'localhost:29092';
      const { resolveBrokers } = await import('../bus-config');
      expect(resolveBrokers()).toEqual(['localhost:19092']);
    });

    it('falls back to KAFKA_BROKERS when KAFKA_BOOTSTRAP_SERVERS is absent', async () => {
      process.env.KAFKA_BROKERS = 'localhost:29092';
      const { resolveBrokers } = await import('../bus-config');
      expect(resolveBrokers()).toEqual(['localhost:29092']);
    });

    it('supports comma-separated broker lists', async () => {
      process.env.KAFKA_BOOTSTRAP_SERVERS = 'host1:9092,host2:9092';
      const { resolveBrokers } = await import('../bus-config');
      expect(resolveBrokers()).toEqual(['host1:9092', 'host2:9092']);
    });

    it('throws when neither var is set', async () => {
      const { resolveBrokers } = await import('../bus-config');
      expect(() => resolveBrokers()).toThrow('KAFKA_BOOTSTRAP_SERVERS');
    });
  });

  describe('getBusMode', () => {
    it('identifies local bus by port 19092', async () => {
      const { getBusMode } = await import('../bus-config');
      expect(getBusMode('localhost:19092')).toBe('local');
    });

    it('identifies cloud bus by port 29092', async () => {
      const { getBusMode } = await import('../bus-config');
      expect(getBusMode('localhost:29092')).toBe('cloud');
    });

    it('returns unknown for unrecognised port', async () => {
      const { getBusMode } = await import('../bus-config');
      expect(getBusMode('localhost:9092')).toBe('unknown');
    });
  });

  describe('getBrokerString', () => {
    it('returns KAFKA_BOOTSTRAP_SERVERS when set', async () => {
      process.env.KAFKA_BOOTSTRAP_SERVERS = 'localhost:19092';
      const { getBrokerString } = await import('../bus-config');
      expect(getBrokerString()).toBe('localhost:19092');
    });

    it('returns "not configured" when neither var is set', async () => {
      const { getBrokerString } = await import('../bus-config');
      expect(getBrokerString()).toBe('not configured');
    });
  });

  describe('getCurrentBusMode', () => {
    it('returns local when KAFKA_BOOTSTRAP_SERVERS is localhost:19092', async () => {
      process.env.KAFKA_BOOTSTRAP_SERVERS = 'localhost:19092';
      const { getCurrentBusMode } = await import('../bus-config');
      expect(getCurrentBusMode()).toBe('local');
    });

    it('returns cloud when KAFKA_BOOTSTRAP_SERVERS is localhost:29092', async () => {
      process.env.KAFKA_BOOTSTRAP_SERVERS = 'localhost:29092';
      const { getCurrentBusMode } = await import('../bus-config');
      expect(getCurrentBusMode()).toBe('cloud');
    });

    it('returns unknown when no broker vars are set', async () => {
      const { getCurrentBusMode } = await import('../bus-config');
      expect(getCurrentBusMode()).toBe('unknown');
    });
  });
});
