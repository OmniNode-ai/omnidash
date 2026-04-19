import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { ComponentRegistry } from './ComponentRegistry';
import type { RegistryManifest } from './types';

const RegistryContext = createContext<ComponentRegistry | null>(null);

export function RegistryProvider({ manifest, children }: { manifest: RegistryManifest; children: ReactNode }) {
  const registry = useMemo(() => {
    const r = new ComponentRegistry(manifest);
    // resolveImplementations() has no real await — iterates a map synchronously.
    // Safe to fire-and-forget until dynamic imports land; see OMN-39.
    void r.resolveImplementations();
    return r;
  }, [manifest]);
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

export function useRegistry(): ComponentRegistry {
  const ctx = useContext(RegistryContext);
  if (!ctx) throw new Error('useRegistry must be used within a RegistryProvider');
  return ctx;
}
