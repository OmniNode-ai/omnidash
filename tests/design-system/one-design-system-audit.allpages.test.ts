// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// OMN-23330 follow-up (operator 2026-11-11: "check our whole dashboard following the one design system"). A live sweep of
// all six pages measured each kind of control against the same kind on the other pages and found:
//   - Settings' first Model providers table drew its five headers as plain text (no glyph, field colour or explanation),
//     where every other table, the second providers table included, uses the shared column header;
//   - Workflow's run search drew its field with 10px corners (Runs' search: 8px) and its Open run button 32px tall beside
//     the 40px field;
//   - the Runs switches' info buttons were 22px where the kit's are 24px.
// Failure modes:
//   A1  a key table writes its headers by hand instead of the shared KEY_HEADERS column header;
//   A2  Workflow's run search field or button is drawn to another size or radius than Runs' search;
//   A3  a page sizes the kit's info button its own way.
//   A4  Usage's record toolbar sizes the kit Dropdown inside it to 32px (Runs' filters draw the same Dropdown at 40px).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

describe('OMN-23330: one design system across the six pages', () => {
  it('A1: both providers tables write their headers with the shared column header', () => {
    const keys = read('src/pages/local/model-keys.tsx');
    expect(keys).not.toMatch(/<th>Provider<\/th>/);
    expect(keys).toMatch(/KEY_HEADERS\.slice\(0, 5\)\.map\(\(\[concept, name, tip\]\) => <th key=\{name\}><ColumnTip tone=\{concept\} tip=\{tip\}>/);
  });

  it('A2: the run search field has 8px corners and its button is 40px with 8px corners', () => {
    const editorial = read('src/styles/editorial.css');
    expect(editorial).toMatch(/\.local-dashboard-filters input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(#ds-important\) \{ border-radius: 8px;/);
    const seven = read('src/styles/seven-page-design.css');
    expect(seven).toMatch(/form\.workflow-run-search > button:not\(#ds-important\)\s*\{[^}]*height: 40px;[^}]*border-radius: 8px/);
    expect(seven).not.toMatch(/\.workflow-run-search > button:not\(#ds-important\) \{ min-height: 40px; border-radius: 999px; \}/);
  });

  it('A3: no page resizes the kit info button', () => {
    expect(read('src/theme/design-system/kit/editorial.css')).not.toMatch(/\.ds-infotip \{ width: 22px; height: 22px;/);
  });

  it('A4: no page rule sizing a toolbar\'s buttons reaches the kit Dropdown inside it', () => {
    const local = read('src/styles/local-dashboard.css') + read('src/styles/seven-page-design.css') + read('src/styles/editorial.css');
    const sizing = [...local.matchAll(/([^{}]*\.usage-record-controls button[^{}]*)\{([^}]*)\}/g)].filter(match => /height/.test(match[2]!));
    expect(sizing.length).toBeGreaterThan(0);
    for (const match of sizing) expect(match[1], match[1]).toMatch(/\.usage-record-controls button:not\(\.ds-dropdown-trigger\)/);
  });
});
