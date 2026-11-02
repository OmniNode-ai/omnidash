// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
/**
 * OMN-21970 AC5: every model on the dashboard is coloured by the tier it ran under, the same colour on every chart and
 * table, with a legend beside each so colour is never the only label.
 *
 * The page builds one model -> tier map from the rows it was served (any row that names a model and a cost_tier_name)
 * and provides it here. Presentation only: nothing is inferred beyond the served fields.
 */
import { createContext, useContext, type CSSProperties } from 'react';
import { modelTierColor, tierColor } from '@/lib/dashboard-colors';

export const ModelTiersContext = createContext<ReadonlyMap<string, string>>(new Map());

/** The colour for a served model: its tier's colour, or none when no row places it in a tier. */
export function useModelColor(): (model: string) => string {
  const tiers = useContext(ModelTiersContext);
  return (model: string) => modelTierColor(model, tiers);
}

/** The tier a served model ran under, or null when no row says. */
export function useModelTier(): (model: string) => string | null {
  const tiers = useContext(ModelTiersContext);
  return (model: string) => tiers.get(model) ?? null;
}

/** The style a model's name carries wherever it is written, in its tier's colour. */
export function useModelIdentityStyle(): (model: unknown) => CSSProperties {
  const color = useModelColor();
  return (model: unknown) => {
    const value = color(typeof model === 'string' ? model : '');
    return { '--model-identity-color': value, '--field-ink': value } as CSSProperties;
  };
}

const TIER_LABELS: Readonly<Record<string, string>> = {
  local: 'Local', harness: 'Harness', frontier: 'Frontier', cheap_frontier: 'Cheap frontier', cloud: 'Cloud',
  cheap_cloud: 'Cheap cloud', claude: 'Claude', customer_keys: 'Your keys (BYOK)', none: 'No tier',
};

export function tierLabel(tier: string): string {
  return Object.hasOwn(TIER_LABELS, tier) ? TIER_LABELS[tier] : tier;
}

/**
 * The legend beside a chart or table that shows models: one swatch and name for each tier its models ran under, in a
 * stable order, so the colour always has a word beside it.
 */
export function TierLegend({ models, label = 'Tier colours' }: { models: readonly string[]; label?: string }) {
  const tierOf = useModelTier();
  const order = Object.keys(TIER_LABELS);
  const tiers = [...new Set(models.map(model => tierOf(model) ?? 'none'))]
    .sort((a, b) => (order.includes(a) ? order.indexOf(a) : order.length) - (order.includes(b) ? order.indexOf(b) : order.length)
      || a.localeCompare(b));
  if (tiers.length === 0) return null;
  return (
    <ul className="tier-legend local-dashboard-caption" aria-label={label} data-testid="tier-legend">
      {tiers.map(tier => (
        <li key={tier} data-tier={tier}>
          <i aria-hidden="true" style={{ background: tierColor(tier) }} />
          {tierLabel(tier)}
        </li>
      ))}
    </ul>
  );
}
