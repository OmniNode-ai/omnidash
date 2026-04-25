import type { JSONSchema7, JSONSchema7Definition, JSONSchema7TypeName } from 'json-schema';
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

    const schema: JSONSchema7 = entry.manifest.configSchema;
    if (!schema || typeof schema !== 'object') return { valid: true, errors: [] };

    // Restricted JSON Schema subset: properties + additionalProperties + leaf type.
    // Anything richer (oneOf, $ref, format) is intentionally not supported here
    // — RJSF + ajv8 do the full validation in the configure-widget UI.
    const errors: string[] = [];
    const props: Record<string, JSONSchema7Definition> = schema.properties ?? {};
    const additionalProperties = schema.additionalProperties;

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
        if (val === undefined) continue;
        // boolean propSchema (`true` / `false`) means "allow anything" / "deny";
        // we only type-check the object form.
        if (typeof propSchema !== 'object') continue;
        const expectedType = propSchema.type;
        if (typeof expectedType !== 'string') continue;
        if (!checkLeafType(expectedType, val)) {
          errors.push(`Config key "${key}" must be a ${expectedType}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

function checkLeafType(expected: JSONSchema7TypeName, val: unknown): boolean {
  switch (expected) {
    case 'string':
      return typeof val === 'string';
    case 'number':
    case 'integer':
      return typeof val === 'number';
    case 'boolean':
      return typeof val === 'boolean';
    case 'array':
      return Array.isArray(val);
    case 'object':
      return val !== null && typeof val === 'object' && !Array.isArray(val);
    case 'null':
      return val === null;
    default:
      return true;
  }
}
