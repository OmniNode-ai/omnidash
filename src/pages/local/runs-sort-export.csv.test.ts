// OMN-24616 AC7: a Runs export cell that a spreadsheet would run as a formula is neutralised; a number stays a number.
import { describe, expect, it } from 'vitest';
import { runsToCsv } from './runs-sort-export';

describe('runsToCsv formula safety', () => {
  it('neutralises a served string that starts with =, +, - or @', () => {
    const csv = runsToCsv([{ prompt: '=HYPERLINK("http://x","y")', a: '+1', b: '-cmd', c: '@SUM(A1)' }]);
    const cells = csv.split('\r\n')[1];
    expect(cells).toBe(`"'=HYPERLINK(""http://x"",""y"")","'+1","'-cmd","'@SUM(A1)"`);
  });

  it('leaves a served number, including a negative one, as it was served', () => {
    const csv = runsToCsv([{ cost_usd: -0.5, tokens_input: 12 }]);
    expect(csv.split('\r\n')[1]).toBe('-0.5,12');
  });
});
