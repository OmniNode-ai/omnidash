/**
 * OMN-12808: single URL carve-out invariant.
 *
 * The omnidash URL-contract architecture (OMN-10756 / OMN-12803) declares that
 * connection URLs live in exactly ONE authoritative location:
 *
 *   src/data-source/        — the data-source seam (localhost reads route here)
 *   src/config/generated/   — contract-generated defaults (data-source-defaults.ts)
 *
 * Every other file in src/ must NOT embed a raw connection URL (an http(s)/ws
 * scheme pointed at localhost/127.0.0.1/a private 192.168.x.y address, or a bare
 * private-IP literal) UNLESS an explicit `url-authority-ok:` annotation — on the
 * offending line or the line immediately above it — justifies why the literal is
 * synthetic/non-connecting (e.g. a storybook fixture display value, a UI
 * placeholder string).
 *
 * Test files (*.test.ts / *.test.tsx) embed URLs to drive ESLint rule fixtures
 * and adapter unit tests; they are excluded — those literals never reach a real
 * fetch in app code.
 *
 * This is the mechanical proof of OMN-12808's "single data-source carve-out":
 * a new straggler URL added to a component/service/fixture fails this test
 * unless it is either routed through the carve-out or explicitly annotated.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative } from 'path';

const ROOT = resolve(__dirname, '..');
const SRC = resolve(ROOT, 'src');

// The authoritative URL locations (the carve-out). Paths are relative to src/.
const CARVE_OUT_PREFIXES = ['data-source/', 'config/generated/'];

// Raw connection-URL literals we forbid outside the carve-out:
//   - http(s)/ws(s) scheme aimed at localhost / 127.0.0.1 / a 192.168.x host
//   - a 192.168.x.* private-IP literal (the trailing octet may be a template
//     interpolation, e.g. `192.168.86.${n}`, so we match the 3-octet prefix)
const CONNECTION_URL_PATTERNS: RegExp[] = [
  /\b(?:https?|wss?):\/\/(?:localhost|127\.0\.0\.1|192\.168\.\d{1,3})/i,
  /\b192\.168\.\d{1,3}\.\d{0,3}/,
];

// Per-line escape hatch (same mechanism as the url-authority ratchet gate).
const ANNOTATION = 'url-authority-ok:';

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue; // test fixtures embed URLs by design
    if (/\.d\.ts$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

function isCarveOut(relPath: string): boolean {
  return CARVE_OUT_PREFIXES.some((p) => relPath.startsWith(p));
}

describe('OMN-12808: single URL carve-out', () => {
  it('no unannotated connection-URL literal exists in src/ outside the carve-out', () => {
    const offenders: string[] = [];

    for (const file of listSourceFiles(SRC)) {
      const relPath = relative(SRC, file);
      if (isCarveOut(relPath)) continue;

      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, idx) => {
        // Annotation may sit on the offending line itself or on the
        // immediately-preceding line (mirrors `eslint-disable-next-line`).
        const annotated =
          line.includes(ANNOTATION) || (idx > 0 && lines[idx - 1].includes(ANNOTATION));
        if (annotated) return;
        if (CONNECTION_URL_PATTERNS.some((re) => re.test(line))) {
          offenders.push(`${relPath}:${idx + 1}: ${line.trim()}`);
        }
      });
    }

    expect(
      offenders,
      `Connection-URL literal(s) found outside the data-source carve-out without a ` +
        `'${ANNOTATION}' annotation. Route the URL through src/data-source/ / the ` +
        `contract, or annotate the line if it is a synthetic/non-connecting value:\n` +
        offenders.join('\n'),
    ).toEqual([]);
  });
});
