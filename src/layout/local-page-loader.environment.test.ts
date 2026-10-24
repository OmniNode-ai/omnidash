import { describe, expect, it, vi } from 'vitest';

// The local manifest already extends core's vocabulary with alert_banner.
// Its accepted contract must be a local extension, never an assertion that
// core's generated enum/config schema contains that value.
vi.mock('../pages/local/overview.contracts.yaml?raw', () => ({ default: JSON.stringify({
  components: [{ component_id: 'environment-alerts', component_kind: 'alert_banner', title: 'Alerts',
    contract_version: { major: 1, minor: 0, patch: 0 }, data_bindings: [] }],
  page_empty_state_reasons: ['NO_RUNS_YET', 'BASELINE_UNRESOLVED'],
}) }));

import { loadLocalPageConfig } from './local-page-loader';

describe('OMN-19988 existing local manifest vocabulary', () => {
  it('accepts the existing alert_banner local component contract', () => {
    expect(loadLocalPageConfig('overview').components[0]?.component_kind).toBe('alert_banner');
  });
});
