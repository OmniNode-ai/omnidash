import { describe, it, expect } from 'vitest';
import { runtimeIdentity, type RuntimeMode, type RuntimeIdentity } from '../runtime-identity';

describe('runtime-identity', () => {
  describe('RuntimeMode type', () => {
    it('should accept all valid runtime modes', () => {
      const validModes: RuntimeMode[] = ['standalone', 'managed', 'orchestrated', 'development'];
      // Compile-time assertion: assigning each literal to RuntimeMode must not error
      validModes.forEach((mode) => {
        expect(typeof mode).toBe('string');
      });
    });
  });

  describe('RuntimeIdentity interface', () => {
    it('should have runtimeMode typed as RuntimeMode', () => {
      // runtimeIdentity.runtimeMode must satisfy RuntimeMode at runtime
      const mode: RuntimeMode = runtimeIdentity.runtimeMode;
      const validModes: readonly string[] = [
        'standalone',
        'managed',
        'orchestrated',
        'development',
      ];
      expect(validModes).toContain(mode);
    });

    it('should default runtimeMode to standalone when ONEX_RUNTIME_MODE is not set', () => {
      // In test environment no ONEX_RUNTIME_MODE is set → should fall back to 'standalone'
      expect(runtimeIdentity.runtimeMode).toBe('standalone');
    });

    it('should default supervised to false when ONEX_NODE_ID is not set', () => {
      expect(runtimeIdentity.supervised).toBe(false);
    });
  });

  describe('getRuntimeIdentityForApi shape compatibility', () => {
    it('runtimeIdentity should satisfy RuntimeIdentity interface shape', () => {
      const identity: RuntimeIdentity = runtimeIdentity;
      expect(identity).toHaveProperty('nodeId');
      expect(identity).toHaveProperty('contractFingerprint');
      expect(identity).toHaveProperty('runtimeMode');
      expect(identity).toHaveProperty('env');
      expect(identity).toHaveProperty('supervised');
      expect(identity).toHaveProperty('supervisorPid');
      expect(identity).toHaveProperty('injectedAt');
    });
  });
});
