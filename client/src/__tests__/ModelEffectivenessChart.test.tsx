/**
 * ModelEffectivenessChart unit tests (OMN-3443)
 *
 * Tests the horizontal bar chart component that renders agreement rate per
 * model, wired to the /api/llm-routing/by-model endpoint.
 *
 * Notes:
 * - Recharts SVG is not rendered in jsdom (ResponsiveContainer renders an
 *   empty container with no size). Model name YAxis ticks and percent bar
 *   values are not accessible via DOM queries in jsdom.
 * - We test: empty state rendering, and that the component renders without
 *   throwing for non-empty data (smoke test).
 * - Asserting SVG-rendered model names or percent values is intentionally
 *   skipped — those are brittle in jsdom.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModelEffectivenessChart } from '@/pages/LlmRoutingDashboard';
import type { LlmRoutingByModel } from '@shared/llm-routing-types';

// Recharts uses ResizeObserver internally; provide a no-op stub for jsdom.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

// ── Fixtures ────────────────────────────────────────────────────────────────

const makeRow = (model: string, agreement_rate = 0.75): LlmRoutingByModel => ({
  model,
  total: 100,
  agreed: Math.round(agreement_rate * 100),
  disagreed: 100 - Math.round(agreement_rate * 100),
  agreement_rate,
  avg_llm_latency_ms: 120,
  avg_cost_usd: 0.0001,
  prompt_tokens_avg: 0,
  completion_tokens_avg: 0,
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ModelEffectivenessChart', () => {
  it('renders the empty state when data is empty', () => {
    render(<ModelEffectivenessChart data={[]} />);
    expect(screen.getByText(/no model data available yet/i)).toBeInTheDocument();
  });

  it('does not render the empty state when data is non-empty', () => {
    const data = [makeRow('anthropic/claude-sonnet-4-6')];
    render(<ModelEffectivenessChart data={data} />);
    expect(screen.queryByText(/no model data available yet/i)).not.toBeInTheDocument();
  });

  it('renders without throwing for a single model row', () => {
    const data = [makeRow('anthropic/claude-sonnet-4-6')];
    expect(() => render(<ModelEffectivenessChart data={data} />)).not.toThrow();
  });

  it('renders without throwing for multiple model rows', () => {
    const data = [
      makeRow('vendor/model-a', 0.9),
      makeRow('vendor/model-b', 0.55),
      makeRow('vendor/model-c', 0.3),
    ];
    expect(() => render(<ModelEffectivenessChart data={data} />)).not.toThrow();
  });

  it('renders without throwing for a model name without a slash', () => {
    const data = [makeRow('unknown')];
    expect(() => render(<ModelEffectivenessChart data={data} />)).not.toThrow();
  });
});
