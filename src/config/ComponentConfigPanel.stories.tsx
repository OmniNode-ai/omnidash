// Storybook coverage for ComponentConfigPanel — the modal launched
// from a placed widget's gear icon. The panel reads three things:
//   1. The placement (`activeDashboard.layout[i]`) for the placement
//      id passed in via props.
//   2. The current draft (`placementDrafts[placementId]`) from the
//      `useFrameStore` config slice.
//   3. The component's manifest (`configSchema`) from the registry,
//      via `useRegistry()`.
//
// To exercise the panel, stories therefore (a) seed the store with a
// fake dashboard whose layout includes a single placement, and (b)
// wrap the tree in a `RegistryProvider` whose manifest declares that
// placement's component with the desired `configSchema`. The panel
// renders @rjsf against the schema, and stories vary the schema shape
// to drive the visible form.
//
// Stories cover three meaningful renders:
//   - `EmptySchema` (Empty alias): manifest with no schema properties.
//     Modal chrome renders (header, footer, Save/Cancel) but the body
//     has no fields — the cold-start case for a widget that has no
//     configurable settings yet.
//   - `MultiFieldSchema` (Populated alias): a realistic 5-field schema
//     covering string, number, enum, and boolean inputs. The canonical
//     "happy path" render.
//   - `ValidationError`: a required string field with the placement's
//     stored config blank, so RJSF flags the missing field and
//     `hasErrors` toggles Save off. Verifies the disabled-Save branch.
//
// Note: ComponentConfigPanel returns `null` when `placementId` is
// null or the placement / manifest can't be resolved. Stories must
// therefore always pass a valid `placementId` AND seed the store +
// registry with matching entries — otherwise the canvas renders
// nothing.
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { ComponentConfigPanel } from './ComponentConfigPanel';
import { RegistryProvider } from '@/registry/RegistryProvider';
import { makeDashboardDecorator } from '@/storybook/decorators/withDashboardContext';
import { useFrameStore } from '@/store/store';
import type { DashboardDefinition, DashboardLayoutItem } from '@shared/types/dashboard';
import type { ComponentManifest } from '@shared/types/component-manifest';
import type { RegistryManifest } from '@/registry/types';
import type { JSONSchema7 } from 'json-schema';

const FIXED_NOW = '2026-04-24T00:00:00.000Z';

// ----- Fixture builders --------------------------------------------------

// Manifest defaults. Each story overrides `configSchema` and (for
// schemas that need a non-empty default) `formData`.
function makeManifest(name: string, displayName: string, configSchema: JSONSchema7): ComponentManifest {
  return {
    name,
    displayName,
    description: `Storybook fixture component for ${displayName}`,
    category: 'quality',
    version: '1.0.0',
    implementationKey: `fixtures/${name}`,
    configSchema,
    dataSources: [],
    events: { emits: [], consumes: [] },
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    maxSize: { w: 12, h: 8 },
    emptyState: { message: 'No data' },
    capabilities: {
      supports_compare: false,
      supports_export: false,
      supports_fullscreen: false,
    },
  };
}

function makeRegistryManifest(manifest: ComponentManifest): RegistryManifest {
  return {
    manifestVersion: '1.0',
    generatedAt: FIXED_NOW,
    components: { [manifest.name]: manifest },
  };
}

function makePlacement(id: string, componentName: string, config: Record<string, unknown>): DashboardLayoutItem {
  return {
    i: id,
    componentName,
    componentVersion: '1.0.0',
    x: 0,
    y: 0,
    w: 6,
    h: 4,
    config,
  };
}

function makeDashboardWith(placement: DashboardLayoutItem): DashboardDefinition {
  return {
    id: 'dash-storybook',
    schemaVersion: '1.0',
    name: 'Storybook Fixture Dashboard',
    layout: [placement],
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    author: 'storybook',
    shared: false,
  };
}

// Per-story setup decorator: seeds the placement into the store +
// clears any draft so each story starts from the placement's
// committed config (not whatever the previous story left as a draft).
const seedStoreDecorator =
  (placement: DashboardLayoutItem) => (Story: () => React.ReactElement) => {
    const dashboard = makeDashboardWith(placement);
    useFrameStore.setState({
      dashboards: [dashboard],
      activeDashboardId: dashboard.id,
      activeDashboard: dashboard,
      placementDrafts: {},
    });
    return <Story />;
  };

// ----- Schema fixtures ---------------------------------------------------

const EMPTY_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {},
  additionalProperties: false,
};

const MULTI_FIELD_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    title: { type: 'string', title: 'Title', default: 'Cost over time' },
    timeRange: {
      type: 'string',
      title: 'Time range',
      enum: ['1h', '24h', '7d', '30d'],
      default: '7d',
    },
    bucketSize: {
      type: 'number',
      title: 'Bucket size (minutes)',
      minimum: 1,
      maximum: 1440,
      default: 60,
    },
    showLegend: { type: 'boolean', title: 'Show legend', default: true },
    notes: { type: 'string', title: 'Notes', description: 'Free-form annotation' },
  },
  required: ['title', 'timeRange'],
  additionalProperties: false,
};

const REQUIRED_FIELD_SCHEMA: JSONSchema7 = {
  type: 'object',
  properties: {
    label: {
      type: 'string',
      title: 'Label',
      description: 'Required field — leave blank to see the validation error.',
      minLength: 1,
    },
  },
  required: ['label'],
  additionalProperties: false,
};

// ----- Manifests + placements per story ---------------------------------

const EMPTY_MANIFEST = makeManifest('empty-fixture', 'Trivial Widget', EMPTY_SCHEMA);
const MULTI_MANIFEST = makeManifest('multi-fixture', 'Cost Trend', MULTI_FIELD_SCHEMA);
const REQUIRED_MANIFEST = makeManifest('required-fixture', 'Labelled Widget', REQUIRED_FIELD_SCHEMA);

const EMPTY_PLACEMENT = makePlacement('placement-empty', 'empty-fixture', {});
const MULTI_PLACEMENT = makePlacement('placement-multi', 'multi-fixture', {
  title: 'Cost over time',
  timeRange: '7d',
  bucketSize: 60,
  showLegend: true,
  notes: '',
});
const REQUIRED_PLACEMENT = makePlacement('placement-required', 'required-fixture', { label: '' });

// ----- Meta -------------------------------------------------------------

const meta: Meta<typeof ComponentConfigPanel> = {
  title: 'Config / ComponentConfigPanel',
  component: ComponentConfigPanel,
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof ComponentConfigPanel>;

// ----- EmptySchema (Empty alias) ----------------------------------------
//
// Manifest with no schema properties — the modal opens, renders its
// header / Save / Cancel chrome, but the form body is blank. Compliance
// anchor (`Empty`).
export const EmptySchema: Story = {
  args: { placementId: 'placement-empty', onOpenChange: fn() },
  decorators: [
    seedStoreDecorator(EMPTY_PLACEMENT),
    (Story) => (
      <RegistryProvider manifest={makeRegistryManifest(EMPTY_MANIFEST)}>
        <Story />
      </RegistryProvider>
    ),
    makeDashboardDecorator({}),
  ],
};
export const Empty = EmptySchema;

// ----- MultiFieldSchema (Populated alias) -------------------------------
//
// Realistic 5-field schema (string, enum, number, boolean, optional
// string). Stored config is valid, so Save is enabled. Compliance
// anchor (`Populated`).
export const MultiFieldSchema: Story = {
  args: { placementId: 'placement-multi', onOpenChange: fn() },
  decorators: [
    seedStoreDecorator(MULTI_PLACEMENT),
    (Story) => (
      <RegistryProvider manifest={makeRegistryManifest(MULTI_MANIFEST)}>
        <Story />
      </RegistryProvider>
    ),
    makeDashboardDecorator({}),
  ],
};
export const Populated = MultiFieldSchema;

// ----- ValidationError --------------------------------------------------
//
// Required `label` field with stored config blank. RJSF's liveValidate
// flags it on first render; Save button reads `hasErrors` and is
// disabled. Cancel still works.
export const ValidationError: Story = {
  args: { placementId: 'placement-required', onOpenChange: fn() },
  decorators: [
    seedStoreDecorator(REQUIRED_PLACEMENT),
    (Story) => (
      <RegistryProvider manifest={makeRegistryManifest(REQUIRED_MANIFEST)}>
        <Story />
      </RegistryProvider>
    ),
    makeDashboardDecorator({}),
  ],
};
