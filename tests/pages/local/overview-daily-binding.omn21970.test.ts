// OMN-21970 AC2: the Overview's activity charts bind the served per-day totals, delegation.daily.v1, now that the lab
// serves it. Failure modes, declared before the code, each with a test:
//   D1  the Overview drops the daily.v1 binding, so the charts fall back to the newest decision rows;
//   D2  the binding names daily.v1 but not the fields the charts read (tenant_id, days, total_runs);
//   D3  the captured lab catalogue does not mark daily.v1 as served (status ok), so the binding points at a topic the
//       lab does not serve.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLocalPageConfig } from '@/layout/local-page-loader';

const DAILY = 'onex.snapshot.projection.delegation.daily.v1';

function dailyBindings() {
  return loadLocalPageConfig('overview')
    .components.flatMap((c) => c.data_bindings ?? [])
    .filter((b) => b.projection_topic === DAILY);
}

describe('OMN-21970 AC2: Overview binds delegation.daily.v1', () => {
  it('D1: the Overview binds daily.v1 exactly once', () => {
    expect(dailyBindings()).toHaveLength(1);
  });

  it('D2: the binding requires the fields the charts read', () => {
    const [binding] = dailyBindings();
    expect(binding?.required_fields).toEqual(expect.arrayContaining(['tenant_id', 'days', 'total_runs']));
  });

  it('D3: the captured lab catalogue serves daily.v1', () => {
    const catalogue = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src/pages/local/served-catalogue.lab.json'), 'utf8'),
    ) as { exposures: Array<{ topic: string; status: string }> };
    expect(catalogue.exposures.find((e) => e.topic === DAILY)?.status).toBe('ok');
  });
});
