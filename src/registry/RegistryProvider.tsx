import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { ComponentRegistry } from './ComponentRegistry';
import type { RegistryManifest } from './types';

const RegistryContext = createContext<ComponentRegistry | null>(null);

export function RegistryProvider({ manifest, children }: { manifest: RegistryManifest; children: ReactNode }) {
  const registry = useMemo(() => new ComponentRegistry(manifest), [manifest]);
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>;
}

export function useRegistry(): ComponentRegistry {
  const ctx = useContext(RegistryContext);
  if (!ctx) throw new Error('useRegistry must be used within a RegistryProvider');
  return ctx;
}
