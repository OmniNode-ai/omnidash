// OMN-13131 (W6 live wiring, G-H): the first LIVE mount of the renderer-capability
// gate into a dashboard view.
//
// This widget reads the real W5 renderer-capability projection
// (`useRendererCapabilities` → `useProjectionQuery` →
// `/projection/onex.evt.omnimarket.renderer-capability-projection-snapshot.v1`)
// and routes it through the W6 `CapabilityGate`. When the projection is absent
// (no renderer has declared a capability) or degraded (stale heartbeat per the
// W5 TTL), the gate renders the typed `TypedEmptyState` with
// `data-empty-state-reason='upstream-blocked'` — never a blank/blind render and
// never a crash. A fresh, satisfying capability renders the declared renderer
// rows instead.
//
// Doctrine: the client renders truth, it does not create it. This widget owns no
// authority — it only reads the projection and classifies the read through the
// shared W4/W6 primitives (CapabilityDispatcher + CapabilityGate + TypedEmptyState).

import { ComponentWrapper } from '../ComponentWrapper';
import { Text } from '@/components/ui/typography';
import { useRendererCapabilities } from '@/components/renderer-dispatch/useRendererCapabilities';
import { CapabilityGate } from '@/components/renderer-dispatch/CapabilityGate';
import type { RendererRequirement } from '@/components/renderer-dispatch/capability-dispatcher';

// A representative requirement: a renderer that can render the `chart` component
// kind. The gate resolves this against the live capability projection; an absent
// or degraded projection surfaces the typed UPSTREAM_BLOCKED empty-state.
const CHART_RENDERER_REQUIREMENT: RendererRequirement = {
  componentKind: 'chart',
};

export interface RendererCapabilityStatusWidgetProps {
  /** Dashboard config passthrough (no widget-specific options at this iteration). */
  config?: Record<string, unknown>;
}

export default function RendererCapabilityStatusWidget(
  _props: RendererCapabilityStatusWidgetProps,
) {
  const { capabilities, isDegraded, isLoading } = useRendererCapabilities();

  return (
    <ComponentWrapper title="Renderer Capabilities" isLoading={isLoading} isLive>
      <CapabilityGate
        state={{ capabilities, isDegraded }}
        requirement={CHART_RENDERER_REQUIREMENT}
      >
        {(entry) => (
          <div data-testid="renderer-capability-rows">
            <Text as="div" size="sm" color="secondary">
              {capabilities.length} renderer
              {capabilities.length === 1 ? '' : 's'} declared
            </Text>
            <Text as="div" size="lg" weight="bold">
              {entry.capability.renderer_id}
            </Text>
            <Text as="div" size="sm" color="tertiary">
              {entry.capability.supported_component_kinds.join(', ')}
            </Text>
          </div>
        )}
      </CapabilityGate>
    </ComponentWrapper>
  );
}
