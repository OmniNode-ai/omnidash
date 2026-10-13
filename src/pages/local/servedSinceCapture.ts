/**
 * Columns a local page reads that the runtime serves but the captured lab catalogue (served-catalogue.lab.json,
 * captured 2026-10-07) does not list, because the release that added them is newer than the capture. Each entry says
 * where the column is declared. The list can only shrink: once a recapture lists a column its entry has to go, and a
 * test fails until it does. A whole exposure the lab does not serve is never excused here.
 */
export const SERVED_SINCE_CAPTURE: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  'onex.snapshot.projection.delegation.decisions.v1': {
    requested_model: 'omnimarket v0.4.309 node_projection_delegation contract and migration 0058 (OMN-19448)',
    queue_wait_ms: 'omnimarket v0.4.309 node_projection_delegation contract and migration 0058 (OMN-19448)',
    execution_ms: 'omnimarket v0.4.309 node_projection_delegation contract and migration 0058 (OMN-19448)',
  },
};
