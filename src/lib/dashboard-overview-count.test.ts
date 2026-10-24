import { describe, expect, it } from 'vitest';
import { overviewRunCount } from './dashboard-overview-count';

// Failure modes: counting a capped decision sample, partial/duplicate groups, treating missing as zero,
// losing large-integer precision, changing source data, or replacing a later authoritative total.
const group = (model_id: string, task_count: unknown) => ({ model_id, display_name: model_id, task_count });
const row = (rows: unknown) => ({ window: 'all', rows });
describe('complete overview model-group count fallback', () => {
  it('sums every complete same-snapshot model group', () => {
    expect(overviewRunCount(row([group('a', 59180), group('b', '8')]))).toBe('59188');
  });
  it.each([0, '0', 17, '17'])('prefers the authoritative total %s', run_count => {
    expect(overviewRunCount({ ...row([group('a', 999)]), run_count })).toBe(run_count);
  });
  it('keeps integer precision beyond Number.MAX_SAFE_INTEGER', () => {
    expect(overviewRunCount(row([group('a', '9007199254740993'), group('b', 7)]))).toBe('9007199254741000');
  });
  it.each([null, undefined, false, -1, 1.5, '', 'bad', '2.3', Number.MAX_SAFE_INTEGER + 1])('refuses an incomplete or invalid group count %s', value => {
    expect(overviewRunCount(row([group('a', 9), group('b', value)]))).toBeNull();
  });
  it.each([undefined, null, [], {}, '[{"task_count":5}]'])('does not turn absent groups into zero', rows => {
    expect(overviewRunCount(row(rows))).toBeNull();
  });
  it('refuses duplicate model/display groups', () => {
    expect(overviewRunCount(row([group('a', 5), group('a', 5)]))).toBeNull();
  });
  it('refuses groups without an identity', () => {
    expect(overviewRunCount(row([{ task_count: 5 }]))).toBeNull();
  });
  it('does not mix a daily request with an all-time fallback', () => {
    expect(overviewRunCount({ window: 'today', rows: [group('a', 5)] })).toBeNull();
  });
  it('does not infer totals from a decision sample or incomplete provenance subtotals', () => {
    expect(overviewRunCount({ window: 'all', measured_run_count: 100, unknown_run_count: 4, decisions: [group('a', 5)] })).toBeNull();
  });
  it('does not mutate the source snapshot', () => {
    const source = Object.freeze({ window: 'all', rows: Object.freeze([Object.freeze(group('a', 5))]) });
    expect(overviewRunCount(source)).toBe('5');
    expect(source).not.toHaveProperty('run_count');
  });
});
