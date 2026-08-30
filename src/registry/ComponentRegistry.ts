import type { JSONSchema7, JSONSchema7Definition, JSONSchema7TypeName } from 'json-schema';
import type { ComponentCategory } from '@shared/types/component-manifest';
import type { RegisteredComponent, RegistryManifest, ValidationResult } from './types';
import { componentImports } from '@/components/dashboard';
import { TOPICS } from '@shared/types/topics';
import { RENDERER_CAPABILITY_PROJECTION } from '@shared/types/renderer-capability';

/**
 * Every projection topic this app can actually serve, as runtime values.
 *
 * OMN-17199. A manifest `dataSources[].topic` is not decoration and not a CI-only
 * field: it is emitted by `scripts/generate-registry.ts` from these very symbols, and
 * the widgets pass the same symbols to `useProjectionQuery`. Resolving the declaration
 * here — at boot, in the registry the app runs on — is what makes it one field rather
 * than two, so the omnibase_infra `exposure-reader-coverage` gate and the render layer
 * can never disagree about who reads what.
 *
 * The failure this closes is not hypothetical: three widgets in this registry still
 * declare `onex.snapshot.projection.llm_cost.v1`, which no omnimarket contract has
 * exposed since OMN-14896. A declaration nothing resolves rots silently.
 */
const SERVEABLE_PROJECTION_TOPICS: ReadonlySet<string> = new Set<string>([
  ...Object.values(TOPICS),
  // The renderer-capability read path declares its topic on the generated contract
  // mirror rather than in TOPICS; it is a runtime symbol all the same
  // (useRendererCapabilities passes it straight to useProjectionQuery).
  RENDERER_CAPABILITY_PROJECTION.topic,
]);

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
      // OMN-17199: a component whose declared projection topic resolves to no runtime
      // topic symbol cannot be served — `useProjectionQuery` would fetch
      // /projection/<topic> for a topic this app has no symbol for. Surfacing that as
      // an error at boot is what makes `dataSources[].topic` a live declaration the
      // render layer resolves, not a string only CI reads.
      //
      // Checked BEFORE the paletteVisibility branch on purpose: a component hidden from
      // the palette is still wired into layouts, and a broken declaration hidden behind
      // `not_implemented` is exactly the silent rot this ticket exists to stop.
      const unresolved = this.unresolvedProjectionTopics(entry.manifest.dataSources);
      if (unresolved.length > 0) {
        entry.status = 'error';
        entry.error =
          `declares projection topic(s) with no runtime symbol: ${unresolved.join(', ')}`;
        continue;
      }
      // OMN-12833 (A2.5): components classified `hidden` by the one-backend
      // palette sweep are kept out of the palette regardless of whether their
      // implementation code exists — their topic cannot be served by the single
      // standard projection backend today. The palette greys out any component
      // whose status !== 'available'.
      if (entry.manifest.paletteVisibility === 'hidden') {
        entry.status = 'not_implemented';
        continue;
      }
      const key = entry.manifest.implementationKey;
      if (key in componentImports) {
        entry.component = componentImports[key];
        entry.status = 'available';
      } else {
        entry.status = 'not_implemented';
      }
    }
  }

  /**
   * Projection topics one component declares it reads (OMN-17199).
   *
   * This is the reader declaration the `exposure-reader-coverage` gate resolves from
   * the generated manifest. Exposed here so the render layer resolves the SAME field,
   * by name, at runtime.
   */
  getProjectionTopics(name: string): string[] {
    const entry = this.components.get(name);
    if (!entry) return [];
    return entry.manifest.dataSources
      .filter((ds) => ds.type === 'projection' || ds.type === 'websocket')
      .map((ds) => ds.topic)
      .filter((topic): topic is string => typeof topic === 'string' && topic.length > 0);
  }

  /** Every registered component declaring `topic` in its `dataSources` (OMN-17199). */
  getComponentsForProjectionTopic(topic: string): RegisteredComponent[] {
    return Array.from(this.components.values()).filter((c) =>
      this.getProjectionTopics(c.name).includes(topic)
    );
  }

  private unresolvedProjectionTopics(
    dataSources: RegisteredComponent['manifest']['dataSources']
  ): string[] {
    const unresolved: string[] = [];
    for (const ds of dataSources) {
      if (ds.type !== 'projection' && ds.type !== 'websocket') continue;
      const topic = ds.topic;
      if (typeof topic !== 'string' || topic.length === 0) continue;
      if (!SERVEABLE_PROJECTION_TOPICS.has(topic) && !unresolved.includes(topic)) {
        unresolved.push(topic);
      }
    }
    return unresolved;
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

    const schema: JSONSchema7 | undefined = entry.manifest.configSchema;
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
