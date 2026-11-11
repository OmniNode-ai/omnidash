// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// OMN-23330 follow-up (operator 2026-11-11: "check our whole dashboard following the one design system"). A live sweep
// measured Delegation Evidence's tab cards at 65px with weights 700/400 where Overview, Runs and Usage draw them at 57px
// with 600/500. The cause: 37 shared rules were written `.local-dashboard-page :is(..., main.ev-root)`, which asks for
// main.ev-root inside .local-dashboard-page; Evidence's root is never there, so it silently missed every one of them.
// Failure mode:
//   R1  a shared rule names Delegation Evidence's root (main.ev-root) inside a .local-dashboard-page ancestor it never has.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../../src');
function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? cssFiles(full) : name.endsWith('.css') && !name.startsWith('._') ? [full] : [];
  });
}

describe('OMN-23330: every shared rule that names Delegation Evidence can reach it', () => {
  it('R1: no selector asks for main.ev-root inside .local-dashboard-page', () => {
    const found = cssFiles(SRC).flatMap(file => [...readFileSync(file, 'utf8').matchAll(/\.local-dashboard-page\s+:is\(([^)]*)\)/g)]
      .filter(match => /main\.ev-root/.test(match[1]!)).map(() => path.relative(SRC, file)));
    expect(found).toEqual([]);
  });
});
