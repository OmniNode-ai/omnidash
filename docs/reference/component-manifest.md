# Reference: ComponentManifest

**Owner:** `omnidash`
**Last verified:** 2026-04-29
**Verification:** `npm run check`
**Source of truth:** `shared/types/component-manifest.ts`

---

## Overview

A `ComponentManifest` describes a single dashboard widget to the component registry. Manifests declare:

- Identity: name, display name, description, category, version.
- Sizing constraints: default, minimum, and maximum grid sizes.
- Data sources: what topics or projection endpoints the widget reads.
- Events: what the widget emits and consumes on the mitt bus.
- Config schema: a JSON Schema that governs what per-instance configuration the widget accepts.

The registry discovers manifests from two sources:

1. **In-repo MVP manifests** — `MVP_COMPONENTS` in `scripts/generate-registry.ts`.
2. **External package manifests** — declared in `@omninode/*` npm packages via the `"dashboardComponents"` field in their `package.json`.

---

## ComponentManifest Fields

```typescript
interface ComponentManifest {
  name: string;          // registry key — immutable, URL-safe slug
  displayName: string;   // human-facing label (can change across versions)
  description: string;   // one-sentence description
  category: ComponentCategory; // 'cost' | 'activity' | 'quality' | 'health'
  version: string;       // semver
  implementationKey: string; // path within componentImports map in index.ts

  configSchema?: JSONSchema7; // JSON Schema for per-instance config (optional)
                              // omit if the widget has nothing to configure

  dataSources: DataSourceDeclaration[]; // what data the widget reads
  events: {
    emits: ComponentEvent[];    // events the widget fires on the mitt bus
    consumes: ComponentEvent[]; // events the widget listens to on the mitt bus
  };

  defaultSize: GridSize; // { w: number; h: number } in grid units
  minSize: GridSize;     // minimum resize bounds
  maxSize: GridSize;     // maximum resize bounds

  emptyState: {
    message: string;  // shown when no data is available
    hint?: string;    // optional guidance for the user
  };

  status?: 'stable' | 'beta' | 'not_implemented'; // default: 'stable'
}
```

### ComponentCategory

```typescript
const COMPONENT_CATEGORIES = ['cost', 'activity', 'quality', 'health'] as const;
type ComponentCategory = typeof COMPONENT_CATEGORIES[number];
```

Categories group widgets by domain (what the widget shows), not by chart shape (what it looks like). This keeps 2D and 3D variants of the same data together in the palette.

### GridSize

```typescript
interface GridSize {
  w: number; // grid columns
  h: number; // grid rows
}
```

### DataSourceDeclaration

```typescript
interface DataSourceDeclaration {
  type: 'websocket' | 'projection'; // how the data arrives
  topic?: string;                   // Kafka topic name (for websocket type)
  required: boolean;                // whether the widget fails without this source
  purpose: 'live_updates' | 'initial_fetch'; // how the widget uses this data
  auth_required?: boolean;          // whether the endpoint requires auth
}
```

### ComponentEvent

```typescript
interface ComponentEvent {
  name: string;                        // event name on the mitt bus
  schema?: Record<string, unknown>;    // optional JSON Schema for the payload
}
```

### configSchema

`configSchema` is a `JSONSchema7` definition. It is the source of truth for:

- What config keys a widget accepts.
- Types, defaults, and constraints for each key.
- Validation of `DashboardLayoutItem.config` on dashboard load.
- Config panel UI generation in edit mode (the frame generates form controls from the schema).
- AI-generated dashboard configs (the AI reads the schema to know what is valid).

Omit `configSchema` if the widget has no configurable settings. When present, it must have `type: 'object'` at the top level.

---

## implementationKey Convention

The `implementationKey` matches an entry in the `componentImports` lazy-import map in `src/components/dashboard/index.ts`:

```ts
// index.ts
export const componentImports: Record<string, () => Promise<{ default: ComponentType<WidgetProps> }>> = {
  'cost-trend/CostTrend': lazy(() => import('./cost-trend/CostTrend')),
  // ...
};
```

Convention: `'<widget-dir>/<ComponentName>'`

If a manifest's `implementationKey` has no matching entry in `componentImports`, the widget appears in the palette with `status: 'not_implemented'` and cannot be placed on a dashboard. The registry does not crash.

---

## Example

```typescript
const costTrendManifest: ComponentManifest = {
  name: 'cost-trend',
  displayName: 'Cost Trend',
  description: 'Stacked cost chart across cost categories over time.',
  category: 'cost',
  version: '1.0.0',
  implementationKey: 'cost-trend/CostTrend',
  configSchema: {
    type: 'object',
    properties: {
      dimension: {
        type: 'string',
        enum: ['2d', '3d'],
        default: '2d',
        description: 'Chart dimension variant',
      },
      style: {
        type: 'string',
        enum: ['area', 'bar'],
        default: 'area',
        description: 'Chart style (only meaningful in 3D mode)',
      },
    },
    additionalProperties: false,
  },
  dataSources: [
    {
      type: 'projection',
      topic: 'onex.evt.omnimarket.cost-ledger.v1',
      required: true,
      purpose: 'initial_fetch',
    },
  ],
  events: {
    emits: [],
    consumes: [{ name: 'time_range_changed' }],
  },
  defaultSize: { w: 6, h: 4 },
  minSize: { w: 3, h: 3 },
  maxSize: { w: 12, h: 8 },
  emptyState: {
    message: 'No cost data available',
    hint: 'Start a workflow to generate cost events.',
  },
};
```

---

## Registry Generation

Manifests are registered in `scripts/generate-registry.ts` under `MVP_COMPONENTS`:

```ts
export const MVP_COMPONENTS: Record<string, ComponentManifest> = {
  'cost-trend/CostTrend': costTrendManifest,
  // ...
};
```

After editing `MVP_COMPONENTS`, run:

```bash
npm run generate:registry
```

This rewrites `src/registry/component-registry.json`. Do not hand-edit that file.

---

## Related

- [`docs/reference/dashboard-definition.md`](dashboard-definition.md) — `DashboardDefinition` schema (uses manifests for `config` validation)
- [`docs/architecture/composable-frame.md`](../architecture/composable-frame.md) — how the registry discovers and resolves manifests
- [`docs/development.md`](../development.md) — step-by-step widget addition guide
- Source: `shared/types/component-manifest.ts`
