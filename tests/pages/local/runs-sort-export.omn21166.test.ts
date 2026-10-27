// OMN-21166 part 14, AC75 and AC76 (Lakshman 2026-10-25, benchmark against leading AI dashboards): the Runs list sorts
// by time, duration and cost, and exports exactly the rows the search and filters show. Written before the code, from
// the failure modes the spec declares:
//   S1  not-recorded values come first in one direction (they must be last in both);
//   S2  numbers are compared as text ("10000" before "900", "10.2" before "9.5");
//   S3  rows that tie change their order between renders (the newest-first order must hold among ties);
//   E1  the export includes rows the current search and filters hide;
//   E2  the export drops a served field's value, or turns a missing value into 0;
//   E3  the export adds a field the served rows do not have;
//   E4  a value with a comma, quote or line break breaks the CSV row.
import { describe, expect, it } from 'vitest';
import { runsToCsv, runsToJson, sortRuns } from '@/pages/local/runs-sort-export';

const run = (id: string, over: Record<string, unknown> = {}) => ({ correlation_id: id, created_at: '2026-10-25T10:00:00Z', ...over });
const ids = (rows: ReadonlyArray<Record<string, unknown>>) => rows.map(row => row.correlation_id);
const noSession = () => undefined;

describe('sortRuns', () => {
  it('S2: duration and cost compare as numbers, in both directions', () => {
    const rows = [run('a', { latency_ms: 10000, cost_usd: '10.2' }), run('b', { latency_ms: 900, cost_usd: '9.5' }), run('c', { latency_ms: 45000, cost_usd: '0.07' })];
    expect(ids(sortRuns(rows, 'duration', 'asc', noSession))).toEqual(['b', 'a', 'c']);
    expect(ids(sortRuns(rows, 'duration', 'desc', noSession))).toEqual(['c', 'a', 'b']);
    expect(ids(sortRuns(rows, 'cost', 'asc', noSession))).toEqual(['c', 'b', 'a']);
    expect(ids(sortRuns(rows, 'cost', 'desc', noSession))).toEqual(['a', 'b', 'c']);
  });

  it('S1: a run with no recorded value is last whichever way the column sorts', () => {
    const rows = [run('none', { latency_ms: null }), run('fast', { latency_ms: 5 }), run('text', { latency_ms: 'n/a' }), run('slow', { latency_ms: 50 })];
    expect(ids(sortRuns(rows, 'duration', 'asc', noSession))).toEqual(['fast', 'slow', 'none', 'text']);
    expect(ids(sortRuns(rows, 'duration', 'desc', noSession))).toEqual(['slow', 'fast', 'none', 'text']);
  });

  it('time sorts by created time, and a run with no time is last both ways', () => {
    const rows = [run('mid', { created_at: '2026-10-24T12:00:00Z' }), run('none', { created_at: null }), run('new', { created_at: '2026-10-25T12:00:00Z' }), run('old', { created_at: '2026-10-01T00:00:00Z' })];
    expect(ids(sortRuns(rows, 'created', 'desc', noSession))).toEqual(['new', 'mid', 'old', 'none']);
    expect(ids(sortRuns(rows, 'created', 'asc', noSession))).toEqual(['old', 'mid', 'new', 'none']);
  });

  it('cost reads the run\'s session cost first, as the Local cost column shows it', () => {
    const rows = [run('a', { cost_usd: '5' }), run('b', { cost_usd: '1' })];
    const sessions = (id: string) => (id === 'b' ? { local_cost_usd: '9' } : undefined);
    expect(ids(sortRuns(rows, 'cost', 'desc', sessions))).toEqual(['b', 'a']);
  });

  it('S3: ties keep the order the rows came in', () => {
    const rows = [run('first', { latency_ms: 7 }), run('second', { latency_ms: 7 }), run('third', { latency_ms: 7 })];
    expect(ids(sortRuns(rows, 'duration', 'asc', noSession))).toEqual(['first', 'second', 'third']);
    expect(ids(sortRuns(rows, 'duration', 'desc', noSession))).toEqual(['first', 'second', 'third']);
  });

  it('does not change the rows it is given', () => {
    const rows = [run('b', { latency_ms: 2 }), run('a', { latency_ms: 1 })];
    sortRuns(rows, 'duration', 'asc', noSession);
    expect(ids(rows)).toEqual(['b', 'a']);
  });
});

describe('runsToJson / runsToCsv', () => {
  const shown = [
    run('r1', { model_name: 'local-a', latency_ms: 700, cost_usd: null }),
    run('r2', { model_name: 'cloud-b', quality_gate_detail: 'failed, "timeout"\nretry' }),
  ];

  it('E1, E2, E3: JSON is the served rows given, values and nulls as served, nothing added', () => {
    expect(JSON.parse(runsToJson(shown))).toEqual(shown);
  });

  it('E3: the CSV header is the served fields, in first-seen order, and no other', () => {
    const header = runsToCsv(shown).split('\r\n')[0];
    expect(header).toBe('correlation_id,created_at,model_name,latency_ms,cost_usd,quality_gate_detail');
  });

  it('E2: a missing value is an empty cell, never 0', () => {
    const first = runsToCsv(shown).split('\r\n')[1];
    expect(first).toBe('r1,2026-10-25T10:00:00Z,local-a,700,,');
  });

  it('E4: commas, quotes and line breaks are quoted, so the row stays one row', () => {
    const csv = runsToCsv(shown);
    expect(csv).toContain('"failed, ""timeout""\nretry"');
    expect(csv.split('\r\n')).toHaveLength(3);
  });

  it('E1: an empty selection exports no rows, not the whole store', () => {
    expect(runsToJson([])).toBe('[]');
    expect(runsToCsv([])).toBe('');
  });
});
