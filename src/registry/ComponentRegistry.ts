import type { ComponentCategory } from '@shared/types/component-manifest';
import type { RegisteredComponent, RegistryManifest, ValidationResult } from './types';
import { componentImports } from '@/components/dashboard';

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

  /**
   * @provisional — uses a generated static import map (`componentImports`) built at compile time.
   * The durable solution is to scan omnimarket `contract.yaml` files at build time and
   * generate this map automatically. Do not treat the current import map as a stable API.
   */
  async resolveImplementations(): Promise<void> {
    for (const [, entry] of this.components) {
      const key = entry.manifest.implementationKey;
      if (key in componentImports) {
        entry.component = componentImports[key];
        entry.status = 'available';
      } else {
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

    // Basic config shape checking against a restricted schema subset (not full JSON Schema)
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
