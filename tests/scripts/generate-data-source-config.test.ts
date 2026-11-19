// OMN-26056: the dashboard's refresh interval and decisions record window are declared config. contract.yaml owns the
// defaults (120 s and a window of 100 runs), and a deployment overlay (contract.local.yaml) may name larger or
// smaller ones. Failure modes, each with a test below:
//   P1  the base contract's defaults drifting from 120 s and a window of 100 runs, the safe values for a shared dev runtime;
//   P2  an overlay's refresh section being ignored, so the lab cannot slow the page down through config;
//   P3  an overlay that names a refresh section clobbering the data-source values it does not name;
//   P4  an interval under the 30 s floor, or a window that is not a whole number in 0..500, being accepted silently.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseContract } from '../../scripts/generate-data-source-config';

const BASE_CONTRACT = readFileSync(path.resolve(__dirname, '..', '..', 'contract.yaml'), 'utf8');

describe('OMN-26056 refresh section of the data-source contract', () => {
  it('P1: the base contract carries 120 s and a record window of 100', () => {
    const d = parseContract(BASE_CONTRACT);
    expect(d.refreshIntervalSeconds).toBe(120);
    expect(d.decisionsPageLimit).toBe(100);
  });

  it('P1b: an overlay that names no refresh section (the host build writes none) serves the base 120 and 100', () => {
    const d = parseContract('data_source:\n  url: "http://example.invalid/projection-api"\n  projection_tenant_id: "t"\n', parseContract(BASE_CONTRACT));
    expect(d.refreshIntervalSeconds).toBe(120);
    expect(d.decisionsPageLimit).toBe(100);
  });

  it('P1c: an overlay may restore the old 30 s and no window', () => {
    const d = parseContract('refresh:\n  interval_seconds: "30"\n  decisions_page_limit: "0"\n', parseContract(BASE_CONTRACT));
    expect(d.refreshIntervalSeconds).toBe(30);
    expect(d.decisionsPageLimit).toBe(0);
  });

  it('P2: an overlay names the interval and the window', () => {
    const d = parseContract('refresh:\n  interval_seconds: "120"\n  decisions_page_limit: "50"\n', parseContract(BASE_CONTRACT));
    expect(d.refreshIntervalSeconds).toBe(120);
    expect(d.decisionsPageLimit).toBe(50);
  });

  it('P3: an overlay with only a refresh section leaves the data-source values alone, and the reverse', () => {
    const base = parseContract(BASE_CONTRACT);
    const refreshOnly = parseContract('refresh:\n  interval_seconds: "60"\n', base);
    expect(refreshOnly.mode).toBe(base.mode);
    expect(refreshOnly.projectionTenantId).toBe(base.projectionTenantId);
    const urlOnly = parseContract('data_source:\n  url: "http://example.invalid/projection-api"\n', refreshOnly);
    expect(urlOnly.refreshIntervalSeconds).toBe(60);
    expect(urlOnly.url).toBe('http://example.invalid/projection-api');
  });

  it.each([
    ['interval under the 30 s floor', 'refresh:\n  interval_seconds: "10"\n'],
    ['interval that is not a number', 'refresh:\n  interval_seconds: "soon"\n'],
    ['window below zero', 'refresh:\n  decisions_page_limit: "-1"\n'],
    ['window above the 500-run server page', 'refresh:\n  decisions_page_limit: "501"\n'],
    ['window that is not a whole number', 'refresh:\n  decisions_page_limit: "2.5"\n'],
  ])('P4: %s is refused', (_name, overlay) => {
    expect(() => parseContract(overlay, parseContract(BASE_CONTRACT))).toThrow(/refresh\./);
  });
});
