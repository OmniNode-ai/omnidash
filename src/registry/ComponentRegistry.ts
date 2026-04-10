import { lazy } from 'react';
import type { ComponentCategory } from '@shared/types/component-manifest';
import type { RegisteredComponent, RegistryManifest, ValidationResult } from './types';

export class ComponentRegistry {
  private components = new Map<string, RegisteredComponent>();

  constructor(manifest: RegistryManifest) {
    for (const [name, m] of Object.entries(manifest.components)) {
      this.components.set(name, {
        name,
        status: 'not_implemented',
        manifest: m,
      });
    }
  }

  // PROVISIONAL: resolveImplementations() is NOT called in the Part 2 runtime path.
  // All components default to `not_implemented` in this phase. Part 3 will resolve
  // implementations once concrete component files exist.
  //
  // The dynamic import approach below (@vite-ignore with variable paths) is provisional
  // runtime resolution only — it is NOT the durable component loading architecture.
  // The durable solution will use a generated static import map (e.g., a code-generated
  // switch/object mapping implementationKey → () => import('./path/to/Component')) so
  // that Vite can statically analyze all import paths at build time.
  async resolveImplementations(): Promise<void> {
    for (const [, entry] of this.components) {
      try {
        const key = entry.manifest.implementationKey;
        const mod = await import(
          /* @vite-ignore */ `../components/dashboard/${key}.tsx`
        );
        if (mod.default) {
          entry.component = lazy(() => import(
            /* @vite-ignore */ `../components/dashboard/${key}.tsx`
          ));
          entry.status = 'available';
        } else {
          entry.status = 'not_implemented';
        }
      } catch {
        entry.status = 'not_implemented';
      }
    }
  }

  getComponent(name: string): RegisteredComponent | undefined {
    return this.components.get(name);
  }

  getAvailableComponents(): RegisteredComponent[] {
    return Array.from(this.components.values());
  }

  getComponentsByCategory(category: ComponentCategory): RegisteredComponent[] {
    return Array.from(this.components.values()).filter(
      (c) => c.manifest.category === category
    );
  }

  validateConfig(name: string, config: unknown): ValidationResult {
    const entry = this.components.get(name);
    if (!entry) return { valid: false, errors: [`Component "${name}" not found`] };

    const schema = entry.manifest.configSchema;
    if (!schema || typeof schema !== 'object') return { valid: true, errors: [] };

    // Basic JSON Schema validation for type: object with properties
    const errors: string[] = [];
    const props = (schema as any).properties || {};
    const additionalProperties = (schema as any).additionalProperties;

    if (config && typeof config === 'object' && !Array.isArray(config)) {
      const configObj = config as Record<string, unknown>;
      if (additionalProperties === false) {
        for (const key of Object.keys(configObj)) {
          if (!(key in props)) {
            errors.push(`Unknown config key: ${key}`);
          }
        }
      }
      for (const [key, propSchema] of Object.entries(props)) {
        const val = configObj[key];
        if (val !== undefined && (propSchema as any).type) {
          const expectedType = (propSchema as any).type;
          if (expectedType === 'string' && typeof val !== 'string') {
            errors.push(`Config key "${key}" must be a string`);
          }
          if (expectedType === 'number' && typeof val !== 'number') {
            errors.push(`Config key "${key}" must be a number`);
          }
          if (expectedType === 'boolean' && typeof val !== 'boolean') {
            errors.push(`Config key "${key}" must be a boolean`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
