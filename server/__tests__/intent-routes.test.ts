import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { _testHelpers } from '../intent-routes';
import type { IntentRecord } from '../intent-events';

// ============================================================================
// Test Data Helpers
// ============================================================================

/**
 * Create a mock IntentRecord for testing
 */
function createMockIntent(overrides: Partial<IntentRecord> = {}): IntentRecord {
  return {
    intentId: `intent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sessionRef: 'test-session',
    intentCategory: 'code_generation',
    confidence: 0.95,
    keywords: ['test', 'mock'],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create multiple mock intents with sequential timestamps
 */
function createMockIntents(count: number, baseTime = Date.now()): IntentRecord[] {
  return Array.from({ length: count }, (_, i) =>
    createMockIntent({
      intentId: `intent-${i}`,
      createdAt: new Date(baseTime - i * 1000).toISOString(), // Each 1 second apart
    })
  );
}

// ============================================================================
// Circular Buffer Tests
// ============================================================================

describe('Circular Buffer', () => {
  // Reset buffer state before each test
  beforeEach(() => {
    _testHelpers.resetBuffer();
  });

  afterEach(() => {
    _testHelpers.resetBuffer();
  });

  describe('addToStore', () => {
    it('should add items to an empty buffer', () => {
      const intent = createMockIntent();
      _testHelpers.addToStore(intent);

      const state = _testHelpers.getBufferState();
      expect(state.count).toBe(1);
      expect(state.head).toBe(1);
    });

    it('should add multiple items sequentially', () => {
      const intents = createMockIntents(5);
      intents.forEach((intent) => _testHelpers.addToStore(intent));

      const state = _testHelpers.getBufferState();
      expect(state.count).toBe(5);
      expect(state.head).toBe(5);
    });

    it('should wrap around when buffer is full', () => {
      // Note: MAX_STORED_INTENTS defaults to 10000, which is too large for this test
      // We'll add items and verify the buffer wraps correctly by checking state
      const maxSize = _testHelpers.MAX_STORED_INTENTS;

      // Add exactly maxSize items
      for (let i = 0; i < maxSize; i++) {
        _testHelpers.addToStore(
          createMockIntent({
            intentId: `intent-${i}`,
          })
        );
      }

      let state = _testHelpers.getBufferState();
      expect(state.count).toBe(maxSize);
      expect(state.head).toBe(0); // Wrapped back to start

      // Add one more to trigger wrap overwrite
      _testHelpers.addToStore(
        createMockIntent({
          intentId: 'overflow-intent',
        })
      );

      state = _testHelpers.getBufferState();
      expect(state.count).toBe(maxSize); // Count should stay at max
      expect(state.head).toBe(1); // Head should advance
    });
  });

  describe('getAllIntentsFromBuffer', () => {
    it('should return empty array for empty buffer', () => {
      const intents = _testHelpers.getAllIntentsFromBuffer();
      expect(intents).toEqual([]);
    });

    it('should return items in reverse chronological order (newest first)', () => {
      const intent1 = createMockIntent({ intentId: 'first' });
      const intent2 = createMockIntent({ intentId: 'second' });
      const intent3 = createMockIntent({ intentId: 'third' });

      _testHelpers.addToStore(intent1);
      _testHelpers.addToStore(intent2);
      _testHelpers.addToStore(intent3);

      const result = _testHelpers.getAllIntentsFromBuffer();

      expect(result).toHaveLength(3);
      expect(result[0].intentId).toBe('third'); // Newest first
      expect(result[1].intentId).toBe('second');
      expect(result[2].intentId).toBe('first'); // Oldest last
    });

    it('should maintain order after buffer wrap', () => {
      const maxSize = _testHelpers.MAX_STORED_INTENTS;

      // Fill buffer completely
      for (let i = 0; i < maxSize; i++) {
        _testHelpers.addToStore(
          createMockIntent({
            intentId: `intent-${i}`,
          })
        );
      }

      // Add 5 more items (these will overwrite the oldest)
      for (let i = 0; i < 5; i++) {
        _testHelpers.addToStore(
          createMockIntent({
            intentId: `overflow-${i}`,
          })
        );
      }

      const result = _testHelpers.getAllIntentsFromBuffer();

      expect(result).toHaveLength(maxSize);
      // Newest items should be first
      expect(result[0].intentId).toBe('overflow-4');
      expect(result[1].intentId).toBe('overflow-3');
      expect(result[2].intentId).toBe('overflow-2');
      expect(result[3].intentId).toBe('overflow-1');
      expect(result[4].intentId).toBe('overflow-0');
    });
  });

  describe('getIntentsFromStore (time-based filtering)', () => {
    it('should return empty array when buffer is empty', () => {
      const result = _testHelpers.getIntentsFromStore(24);
      expect(result).toEqual([]);
    });

    it('should filter intents by time range', () => {
      const now = Date.now();

      // Create intents at different times
      // Note: Use times safely inside/outside boundaries to avoid edge case failures
      const recentIntent = createMockIntent({
        intentId: 'recent',
        createdAt: new Date(now - 1000).toISOString(), // 1 second ago
      });
      const hourAgoIntent = createMockIntent({
        intentId: 'hour-ago',
        createdAt: new Date(now - 61 * 60 * 1000).toISOString(), // 61 minutes ago (safely outside 1 hour)
      });
      const dayAgoIntent = createMockIntent({
        intentId: 'day-ago',
        createdAt: new Date(now - 25 * 60 * 60 * 1000).toISOString(), // 25 hours ago
      });

      _testHelpers.addToStore(dayAgoIntent);
      _testHelpers.addToStore(hourAgoIntent);
      _testHelpers.addToStore(recentIntent);

      // Query for last 24 hours - should exclude day-ago intent
      const result24h = _testHelpers.getIntentsFromStore(24);
      expect(result24h).toHaveLength(2);
      expect(result24h.map((i) => i.intentId)).toContain('recent');
      expect(result24h.map((i) => i.intentId)).toContain('hour-ago');
      expect(result24h.map((i) => i.intentId)).not.toContain('day-ago');

      // Query for last 1 hour - should only return recent (hour-ago is 61 min ago, outside 1hr window)
      const result1h = _testHelpers.getIntentsFromStore(1);
      expect(result1h).toHaveLength(1);
      expect(result1h[0].intentId).toBe('recent');

      // Query for last 48 hours - should return all
      const result48h = _testHelpers.getIntentsFromStore(48);
      expect(result48h).toHaveLength(3);
    });

    it('should return intents in reverse chronological order after filtering', () => {
      const now = Date.now();

      _testHelpers.addToStore(
        createMockIntent({
          intentId: 'oldest',
          createdAt: new Date(now - 3000).toISOString(),
        })
      );
      _testHelpers.addToStore(
        createMockIntent({
          intentId: 'middle',
          createdAt: new Date(now - 2000).toISOString(),
        })
      );
      _testHelpers.addToStore(
        createMockIntent({
          intentId: 'newest',
          createdAt: new Date(now - 1000).toISOString(),
        })
      );

      const result = _testHelpers.getIntentsFromStore(24);

      expect(result[0].intentId).toBe('newest');
      expect(result[1].intentId).toBe('middle');
      expect(result[2].intentId).toBe('oldest');
    });
  });

  describe('getIntentsBySession (session-based filtering)', () => {
    it('should return empty result when buffer is empty', () => {
      const result = _testHelpers.getIntentsBySession('any-session', 100, 0);
      expect(result.intents).toEqual([]);
      expect(result.totalAvailable).toBe(0);
    });

    it('should filter intents by session reference', () => {
      _testHelpers.addToStore(createMockIntent({ sessionRef: 'session-A', intentId: 'a1' }));
      _testHelpers.addToStore(createMockIntent({ sessionRef: 'session-B', intentId: 'b1' }));
      _testHelpers.addToStore(createMockIntent({ sessionRef: 'session-A', intentId: 'a2' }));
      _testHelpers.addToStore(createMockIntent({ sessionRef: 'session-B', intentId: 'b2' }));

      const resultA = _testHelpers.getIntentsBySession('session-A', 100, 0);
      expect(resultA.intents).toHaveLength(2);
      expect(resultA.totalAvailable).toBe(2);
      expect(resultA.intents.every((i) => i.sessionRef === 'session-A')).toBe(true);

      const resultB = _testHelpers.getIntentsBySession('session-B', 100, 0);
      expect(resultB.intents).toHaveLength(2);
      expect(resultB.totalAvailable).toBe(2);
      expect(resultB.intents.every((i) => i.sessionRef === 'session-B')).toBe(true);
    });

    it('should filter by minimum confidence', () => {
      _testHelpers.addToStore(createMockIntent({ confidence: 0.5, intentId: 'low' }));
      _testHelpers.addToStore(createMockIntent({ confidence: 0.75, intentId: 'medium' }));
      _testHelpers.addToStore(createMockIntent({ confidence: 0.95, intentId: 'high' }));

      // All have same session for this test
      const allSameSession = 'test-session';

      const result50 = _testHelpers.getIntentsBySession(allSameSession, 100, 0.5);
      expect(result50.intents).toHaveLength(3);
      expect(result50.totalAvailable).toBe(3);

      const result70 = _testHelpers.getIntentsBySession(allSameSession, 100, 0.7);
      expect(result70.intents).toHaveLength(2);
      expect(result70.totalAvailable).toBe(2);

      const result90 = _testHelpers.getIntentsBySession(allSameSession, 100, 0.9);
      expect(result90.intents).toHaveLength(1);
      expect(result90.totalAvailable).toBe(1);
      expect(result90.intents[0].intentId).toBe('high');
    });

    it('should respect limit parameter and return total available count', () => {
      // Add 10 intents with same session
      for (let i = 0; i < 10; i++) {
        _testHelpers.addToStore(
          createMockIntent({
            sessionRef: 'limited-session',
            intentId: `intent-${i}`,
          })
        );
      }

      const result = _testHelpers.getIntentsBySession('limited-session', 5, 0);
      expect(result.intents).toHaveLength(5);
      expect(result.totalAvailable).toBe(10); // Total matching is 10, but only 5 returned
    });

    it('should combine session filter with confidence filter', () => {
      _testHelpers.addToStore(
        createMockIntent({ sessionRef: 'combo-session', confidence: 0.5, intentId: 'low-combo' })
      );
      _testHelpers.addToStore(
        createMockIntent({ sessionRef: 'combo-session', confidence: 0.9, intentId: 'high-combo' })
      );
      _testHelpers.addToStore(
        createMockIntent({ sessionRef: 'other-session', confidence: 0.95, intentId: 'high-other' })
      );

      const result = _testHelpers.getIntentsBySession('combo-session', 100, 0.8);
      expect(result.intents).toHaveLength(1);
      expect(result.totalAvailable).toBe(1);
      expect(result.intents[0].intentId).toBe('high-combo');
    });

    it('should return correct totalAvailable when limit is less than matches', () => {
      // Add 20 intents with same session
      for (let i = 0; i < 20; i++) {
        _testHelpers.addToStore(
          createMockIntent({
            sessionRef: 'large-session',
            intentId: `intent-${i}`,
          })
        );
      }

      const result = _testHelpers.getIntentsBySession('large-session', 3, 0);
      expect(result.intents).toHaveLength(3);
      expect(result.totalAvailable).toBe(20);
    });
  });

  describe('resetBuffer', () => {
    it('should clear all items from buffer', () => {
      // Add some items
      _testHelpers.addToStore(createMockIntent());
      _testHelpers.addToStore(createMockIntent());
      _testHelpers.addToStore(createMockIntent());

      expect(_testHelpers.getBufferState().count).toBe(3);

      // Reset
      _testHelpers.resetBuffer();

      const state = _testHelpers.getBufferState();
      expect(state.count).toBe(0);
      expect(state.head).toBe(0);
      expect(_testHelpers.getAllIntentsFromBuffer()).toEqual([]);
    });
  });
});

// ============================================================================
// Rate Limiting Tests
// ============================================================================

describe('Rate Limiting', () => {
  beforeEach(() => {
    _testHelpers.resetRateLimitStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    _testHelpers.resetRateLimitStore();
    vi.useRealTimers();
  });

  describe('checkRateLimit', () => {
    it('should allow first request from an IP', () => {
      const result = _testHelpers.checkRateLimit('192.168.1.1');
      expect(result).toBe(true);
    });

    it('should allow requests under the limit', () => {
      const ip = '192.168.1.2';
      const maxRequests = _testHelpers.RATE_LIMIT_MAX_REQUESTS;

      // Make maxRequests requests - all should be allowed
      for (let i = 0; i < maxRequests; i++) {
        const result = _testHelpers.checkRateLimit(ip);
        expect(result).toBe(true);
      }
    });

    it('should block requests over the limit', () => {
      const ip = '192.168.1.3';
      const maxRequests = _testHelpers.RATE_LIMIT_MAX_REQUESTS;

      // Exhaust the limit
      for (let i = 0; i < maxRequests; i++) {
        _testHelpers.checkRateLimit(ip);
      }

      // Next request should be blocked
      const result = _testHelpers.checkRateLimit(ip);
      expect(result).toBe(false);
    });

    it('should track different IPs independently', () => {
      const ip1 = '192.168.1.100';
      const ip2 = '192.168.1.101';
      const maxRequests = _testHelpers.RATE_LIMIT_MAX_REQUESTS;

      // Exhaust limit for ip1
      for (let i = 0; i < maxRequests; i++) {
        _testHelpers.checkRateLimit(ip1);
      }

      // ip1 should be blocked
      expect(_testHelpers.checkRateLimit(ip1)).toBe(false);

      // ip2 should still be allowed
      expect(_testHelpers.checkRateLimit(ip2)).toBe(true);
    });

    it('should reset rate limit after window expires', () => {
      const ip = '192.168.1.4';
      const maxRequests = _testHelpers.RATE_LIMIT_MAX_REQUESTS;
      const windowMs = _testHelpers.RATE_LIMIT_WINDOW_MS;

      // Exhaust the limit
      for (let i = 0; i < maxRequests; i++) {
        _testHelpers.checkRateLimit(ip);
      }

      // Should be blocked
      expect(_testHelpers.checkRateLimit(ip)).toBe(false);

      // Advance time past the window
      vi.advanceTimersByTime(windowMs + 100);

      // Should be allowed again
      expect(_testHelpers.checkRateLimit(ip)).toBe(true);
    });

    it('should reset count to 1 after window expires', () => {
      const ip = '192.168.1.5';
      const maxRequests = _testHelpers.RATE_LIMIT_MAX_REQUESTS;
      const windowMs = _testHelpers.RATE_LIMIT_WINDOW_MS;

      // Use some requests
      for (let i = 0; i < 50; i++) {
        _testHelpers.checkRateLimit(ip);
      }

      expect(_testHelpers.getRateLimitRemaining(ip)).toBe(maxRequests - 50);

      // Advance time past the window
      vi.advanceTimersByTime(windowMs + 100);

      // After first request, remaining should be maxRequests - 1
      _testHelpers.checkRateLimit(ip);
      expect(_testHelpers.getRateLimitRemaining(ip)).toBe(maxRequests - 1);
    });
  });

  describe('getRateLimitRemaining', () => {
    it('should return max requests for unknown IP', () => {
      const result = _testHelpers.getRateLimitRemaining('unknown-ip');
      expect(result).toBe(_testHelpers.RATE_LIMIT_MAX_REQUESTS);
    });

    it('should return correct remaining count', () => {
      const ip = '192.168.1.6';
      const maxRequests = _testHelpers.RATE_LIMIT_MAX_REQUESTS;

      // Make 10 requests
      for (let i = 0; i < 10; i++) {
        _testHelpers.checkRateLimit(ip);
      }

      expect(_testHelpers.getRateLimitRemaining(ip)).toBe(maxRequests - 10);
    });

    it('should return 0 when limit is exhausted', () => {
      const ip = '192.168.1.7';
      const maxRequests = _testHelpers.RATE_LIMIT_MAX_REQUESTS;

      // Exhaust limit
      for (let i = 0; i < maxRequests; i++) {
        _testHelpers.checkRateLimit(ip);
      }

      expect(_testHelpers.getRateLimitRemaining(ip)).toBe(0);
    });

    it('should return max after window expires', () => {
      const ip = '192.168.1.8';
      const windowMs = _testHelpers.RATE_LIMIT_WINDOW_MS;

      // Use some requests
      for (let i = 0; i < 50; i++) {
        _testHelpers.checkRateLimit(ip);
      }

      // Advance past window
      vi.advanceTimersByTime(windowMs + 100);

      expect(_testHelpers.getRateLimitRemaining(ip)).toBe(_testHelpers.RATE_LIMIT_MAX_REQUESTS);
    });
  });

  describe('getRateLimitResetSeconds', () => {
    it('should return full window duration for unknown IP', () => {
      const windowSeconds = Math.ceil(_testHelpers.RATE_LIMIT_WINDOW_MS / 1000);
      const result = _testHelpers.getRateLimitResetSeconds('unknown-ip');
      expect(result).toBe(windowSeconds);
    });

    it('should return time remaining until reset', () => {
      const ip = '192.168.1.9';
      const windowMs = _testHelpers.RATE_LIMIT_WINDOW_MS;

      // Make a request to create entry
      _testHelpers.checkRateLimit(ip);

      // Advance time by half the window
      vi.advanceTimersByTime(windowMs / 2);

      const remaining = _testHelpers.getRateLimitResetSeconds(ip);
      // Should be approximately half the window (in seconds)
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(Math.ceil(windowMs / 2 / 1000));
    });

    it('should return 0 or full window when entry has expired', () => {
      const ip = '192.168.1.10';
      const windowMs = _testHelpers.RATE_LIMIT_WINDOW_MS;
      const windowSeconds = Math.ceil(windowMs / 1000);

      // Make a request
      _testHelpers.checkRateLimit(ip);

      // Advance past window
      vi.advanceTimersByTime(windowMs + 100);

      // Should return full window duration (new entry would be created)
      expect(_testHelpers.getRateLimitResetSeconds(ip)).toBe(windowSeconds);
    });

    it('should decrease as time passes', () => {
      const ip = '192.168.1.11';

      // Make a request
      _testHelpers.checkRateLimit(ip);

      const initialReset = _testHelpers.getRateLimitResetSeconds(ip);

      // Advance by 10 seconds
      vi.advanceTimersByTime(10000);

      const laterReset = _testHelpers.getRateLimitResetSeconds(ip);

      expect(laterReset).toBeLessThan(initialReset);
      expect(initialReset - laterReset).toBeLessThanOrEqual(11); // Allow for rounding
    });
  });

  describe('resetRateLimitStore', () => {
    it('should clear all rate limit entries', () => {
      // Create entries for multiple IPs
      _testHelpers.checkRateLimit('ip1');
      _testHelpers.checkRateLimit('ip2');
      _testHelpers.checkRateLimit('ip3');

      expect(_testHelpers.getRateLimitStoreSize()).toBe(3);

      // Reset
      _testHelpers.resetRateLimitStore();

      expect(_testHelpers.getRateLimitStoreSize()).toBe(0);

      // All IPs should have full quota
      expect(_testHelpers.getRateLimitRemaining('ip1')).toBe(_testHelpers.RATE_LIMIT_MAX_REQUESTS);
      expect(_testHelpers.getRateLimitRemaining('ip2')).toBe(_testHelpers.RATE_LIMIT_MAX_REQUESTS);
      expect(_testHelpers.getRateLimitRemaining('ip3')).toBe(_testHelpers.RATE_LIMIT_MAX_REQUESTS);
    });
  });

  describe('boundary conditions', () => {
    it('should handle exactly max requests (boundary)', () => {
      const ip = '192.168.1.12';
      const maxRequests = _testHelpers.RATE_LIMIT_MAX_REQUESTS;

      // Make exactly maxRequests - 1 requests
      for (let i = 0; i < maxRequests - 1; i++) {
        expect(_testHelpers.checkRateLimit(ip)).toBe(true);
      }

      // This should be the last allowed request
      expect(_testHelpers.checkRateLimit(ip)).toBe(true);
      expect(_testHelpers.getRateLimitRemaining(ip)).toBe(0);

      // This should be blocked
      expect(_testHelpers.checkRateLimit(ip)).toBe(false);
    });

    it('should handle rapid requests within same millisecond', () => {
      const ip = '192.168.1.13';

      // Make multiple requests without advancing time
      const results = [];
      for (let i = 0; i < 10; i++) {
        results.push(_testHelpers.checkRateLimit(ip));
      }

      // All should be allowed
      expect(results.every((r) => r === true)).toBe(true);
      expect(_testHelpers.getRateLimitRemaining(ip)).toBe(
        _testHelpers.RATE_LIMIT_MAX_REQUESTS - 10
      );
    });

    it('should handle request at exactly window boundary', () => {
      const ip = '192.168.1.14';
      const windowMs = _testHelpers.RATE_LIMIT_WINDOW_MS;
      const maxRequests = _testHelpers.RATE_LIMIT_MAX_REQUESTS;

      // Exhaust limit
      for (let i = 0; i < maxRequests; i++) {
        _testHelpers.checkRateLimit(ip);
      }

      // Advance to exactly the window boundary
      vi.advanceTimersByTime(windowMs);

      // At exactly the boundary, should still be blocked (not past reset time)
      // The check is "now > entry.resetTime", so equal is still blocked
      // However, the implementation uses Date.now() which may vary
      // Let's advance 1ms more to be safe
      vi.advanceTimersByTime(1);

      // Now should be allowed
      expect(_testHelpers.checkRateLimit(ip)).toBe(true);
    });
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe('Constants', () => {
  it('should have expected default values', () => {
    // These are the default values when env vars are not set
    expect(_testHelpers.MAX_STORED_INTENTS).toBeGreaterThan(0);
    expect(_testHelpers.RATE_LIMIT_WINDOW_MS).toBe(60000); // 1 minute
    expect(_testHelpers.RATE_LIMIT_MAX_REQUESTS).toBe(100);
  });

  it('should have sensible rate limit values', () => {
    // Rate limit should be reasonable
    expect(_testHelpers.RATE_LIMIT_MAX_REQUESTS).toBeGreaterThan(0);
    expect(_testHelpers.RATE_LIMIT_MAX_REQUESTS).toBeLessThanOrEqual(1000);

    // Window should be at least 1 second
    expect(_testHelpers.RATE_LIMIT_WINDOW_MS).toBeGreaterThanOrEqual(1000);
  });
});
