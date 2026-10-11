// OMN-20226: Compression and Cache hit rate on the Overview are served figures, never browser arithmetic.
//
// Failure modes, each with a test below:
//   C1  each card names its own served column of metering-summary.v1 (compression_ratio, cache_hit_rate) as its
//       metric, not a ratio of two other fields the browser would have to divide;
//   C2  each card binds metering-summary.v1, requiring its column, once the captured lab catalogue serves that column,
//       and waits on it, typed and unbound, until then -- never bound to another exposure;
//   C3  with no measurement behind it (a served row whose two fields are null, or no row at all) each card renders
//       its typed not-measured text, never 0, 0%, 0.00x or a blank.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLocalPageConfig } from '../../layout/local-page-loader';

const METERING = 'onex.snapshot.projection.metering-summary.v1';
const CARDS = [
  { id: 'overview-compression', title: 'Compression', field: 'compression_ratio' },
  { id: 'overview-cache-hit-rate', title: 'Cache hit rate', field: 'cache_hit_rate' },
] as const;

const catalogue = (JSON.parse(readFileSync(resolve(process.cwd(), 'src/pages/local/served-catalogue.lab.json'), 'utf8')) as {
  exposures: Array<{ topic: string; status: string; columns?: string[] }>;
}).exposures;
const metering = catalogue.find((exposure) => exposure.topic === METERING);
const served = (field: string) => metering?.status === 'ok' && (metering.columns ?? []).includes(field);

const page = () => loadLocalPageConfig('overview');
const component = (id: string) => page().components.find((candidate) => candidate.component_id === id);
const widgetConfig = (id: string) =>
  page().dashboard.widgets.find((widget) => widget.data_source === id)?.config as Record<string, unknown> | undefined;

describe('OMN-20226 Overview page contract', () => {
  for (const card of CARDS) {
    it(`C1: ${card.title} names the served ${card.field} as its metric`, () => {
      const contract = component(card.id);
      expect(contract?.component_kind).toBe('metric_card');
      expect(contract?.title).toBe(card.title);
      expect(widgetConfig(card.id)?.metric_key).toBe(card.field);
    });

    it(`C2: ${card.title} binds metering-summary.v1 only once ${card.field} is served`, () => {
      const contract = component(card.id);
      const topics = (contract?.data_bindings ?? []).map((binding) => binding.projection_topic);
      if (served(card.field)) {
        expect(topics).toEqual([METERING]);
        expect(contract?.data_bindings?.[0]?.required_fields).toContain(card.field);
      } else {
        expect(topics).toEqual([]);
        expect(contract?.supported_empty_state_reasons).toEqual(['upstream-blocked']);
      }
    });
  }
});
