// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// OMN-23330 follow-up (operator 2026-11-11, on the window picker's chosen option: "remove left side border - that is not in
// our design"; on Settings' Services: "this should follow our theme style"). A coloured bar down a box's left edge is
// not part of the design system: a chosen or coloured box is a tinted fill with a hairline all round. Measured: the window
// picker (inset 3px), Evidence's active row (inset 2px), the routing counts (2px), and the Services tile and alert banner
// (4px, inline) drew one. One-pixel dividers between cells are not accent bars and stay.
// Failure modes:
//   B1  a stylesheet the six pages load draws a left accent bar (a left border of 2px or more, or an inset left shadow);
//   B2  the alert banner or the status grid draws one inline.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../../src');
function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? cssFiles(full) : name.endsWith('.css') && !name.startsWith('._') ? [full] : [];
  });
}
const BAR = /^(?:[2-9]|\d{2,})(?:\.\d+)?px\b/;

describe('OMN-23330: no left accent bars on the six pages', () => {
  it('B1: no stylesheet draws a left border of 2px or more, or an inset left shadow', () => {
    const found: string[] = [];
    for (const file of [...cssFiles(path.join(SRC, 'styles')), ...cssFiles(path.join(SRC, 'theme'))]) {
      postcss.parse(readFileSync(file, 'utf8')).walkDecls(decl => {
        const value = decl.value.trim();
        const bar = (/^border-(left|inline-start)(-width)?$/.test(decl.prop) && BAR.test(value))
          || (decl.prop === 'box-shadow' && /inset\s+(?:[2-9]|\d{2,})(?:\.\d+)?px\s+0(?:px)?\s+0/.test(value));
        // The column tooltip's arrow is a turned square whose left border is the arrow's edge, not a bar.
        if (bar && /\.ds-tooltip\b[^,]*::before/.test((decl.parent as postcss.Rule).selector ?? '')) return;
        if (bar) found.push(`${path.relative(SRC, file)}: ${(decl.parent as postcss.Rule).selector?.slice(0, 80)} { ${decl.prop}: ${value.slice(0, 40)} }`);
      });
    }
    expect(found).toEqual([]);
  });

  it('B2: the alert banner and the status grid draw no inline left bar', () => {
    for (const file of ['components/dashboard/alert-banner/AlertBanner.tsx', 'components/dashboard/status-grid/StatusGrid.tsx']) {
      expect(readFileSync(path.join(SRC, file), 'utf8'), file).not.toMatch(/borderLeft\s*:/);
    }
  });
});
