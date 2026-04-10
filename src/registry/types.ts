import type { ComponentManifest } from '@shared/types/component-manifest';
import type { LazyExoticComponent, ComponentType } from 'react';

export type ComponentStatus = 'available' | 'not_implemented' | 'error';

export interface RegisteredComponent {
  name: string;
  status: ComponentStatus;
  manifest: ComponentManifest;
  component?: LazyExoticComponent<ComponentType<any>>;
  error?: string;
}

export interface RegistryManifest {
  manifestVersion: string;
  generatedAt: string;
  components: Record<string, ComponentManifest>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}
