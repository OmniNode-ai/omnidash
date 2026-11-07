// OMN-22168, found on the live lab dashboard 2026-11-07: the savings bridge's hover read
// "$3.663405879999999993870909612 exactly, as served". A served decimal longer than a double's precision is written in
// the double's shortest form; anything else passes through, so the exact amounts are still the served ones.
import { describe, expect, it } from 'vitest';
import { withoutFloatNoise } from '@/pages/DelegationEvidencePage';

describe('withoutFloatNoise', () => {
  it('writes a float sum spelled past double precision in its shortest form', () => {
    expect(withoutFloatNoise('3.663405879999999993870909612')).toBe('3.66340588');
    expect(withoutFloatNoise('1714.527128120000000006129090')).toBe('1714.52712812');
  });

  it('the shortest forms still add up: baseline minus spend is the saving', () => {
    const [baseline, spend, saving] = ['1718.190534', '3.663405879999999993870909612', '1714.527128120000000006129090']
      .map(v => String(withoutFloatNoise(v)));
    const micros = (v: string) => BigInt(v.replace('.', '').padEnd(v.indexOf('.') + 9, '0'));
    expect(micros(baseline!) - micros(spend!)).toBe(micros(saving!));
  });

  it('control: a served amount within double precision is left exactly as served', () => {
    for (const v of ['1718.190534', '4.975354', '0.232', '0.00009', '-12.349']) expect(withoutFloatNoise(v)).toBe(v);
    expect(withoutFloatNoise(3.66)).toBe(3.66);
    expect(withoutFloatNoise('not a number')).toBe('not a number');
    expect(withoutFloatNoise(null)).toBe(null);
  });
});
