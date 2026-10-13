// OMN-21015 stage 5, U6: no page of the six shows a number that the runtime did not serve. The pages were redesigned
// beside a demo that shows sample data; this guard reads the page code and refuses the ways a made-up figure gets in.
//
// Failure modes, each with a planted control below:
//   S1  a figure typed into the markup:                       <p>42</p>, <td>$0.00</td>
//   S2  a figure kept as text the page can show:              return '0%', const fallback = '$0.00'
//   S3  a value that was not served turned into a number:     row.spend_usd ?? 0, count || 0
//   S4  a number put straight into the markup:                <dd>{0}</dd>, also signed, bracketed or cast: {-42}, {(42)}
//   S5  the instrument is blind: a page file is missing, is not read as markup, or a planted fault is not seen
//   S6  honest code is refused: a comparison with '0', a padded digit, an icon size, a data attribute, an index
// What it cannot see: a number computed at run time from served values. That is the per-figure comparison's job
// (page against served rows against the store, on a lab host) and the savings-source guard's.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** The code that draws the six pages: the page component, its page-local modules, and the Usage widgets it mounts. */
const PAGE_SOURCES = [
  'src/pages/LocalDashboardPage.tsx',
  ...readdirSync(resolve(process.cwd(), 'src/pages/local'))
    .filter((name) => name.endsWith('.tsx') && !name.includes('.test.'))
    .map((name) => `src/pages/local/${name}`),
  'src/components/dashboard/usage/UsageByModelDayWidget.tsx',
];

/** Text that reads as a figure on its own: digits, with an optional currency sign before and a unit after. */
const FIGURE = /^\s*[$€£]?\s*\d[\d,]*(\.\d+)?\s*(%|ms|s|usd|tokens?|runs?|calls?)?\s*$/i;
/** One word of running text that is a figure: digits, with an optional currency sign before and a percent after. */
const FIGURE_WORD = /^[$€£]?\d[\d,]*(\.\d+)?%?$/;
/** JSX attributes whose value a reader reads; a figure in any other attribute (a size, a data attribute) is not shown. */
const READ_ATTRIBUTES = new Set(['title', 'aria-label', 'aria-valuetext', 'placeholder', 'alt', 'label']);

/**
 * Fallbacks to a number that are not figures, each read and listed with its reason. A new `?? 0` in page code fails
 * until it is either removed or added here by someone who has checked that the number is never shown as served.
 */
const NUMBER_FALLBACKS_READ: ReadonlyArray<{ file: string; code: string; why: string }> = [
  { file: 'src/pages/LocalDashboardPage.tsx', code: 'config.precision ?? 0', why: 'how many decimals a served figure is written with when the page declares none; not a figure' },
  { file: 'src/pages/LocalDashboardPage.tsx', code: 'document.dashboard.refresh_interval_seconds ?? 30', why: 'how often the page reads the runtime again when the page declares no interval; never drawn' },
  { file: 'src/pages/LocalDashboardPage.tsx', code: 'page?.dashboard.refresh_interval_seconds ?? 30', why: 'the same refresh interval, read for the timer; never drawn' },
  { file: 'src/pages/LocalDashboardPage.tsx', code: '(widget?.config as Record<string, unknown> | undefined)?.page_size ?? 25', why: 'rows per page of a table when the page declares none; a layout choice, not a served count' },
  { file: 'src/pages/LocalDashboardPage.tsx', code: 'widget?.width ?? 12', why: 'grid columns a panel spans when the page declares none; layout only' },
  { file: 'src/pages/local/charts.tsx', code: 'params[0]?.dataIndex ?? 0', why: 'which point the pointer is over in the chart tooltip; an index into the served days, not a value' },
];

export interface Finding { rule: 'S1' | 'S2' | 'S3' | 'S4'; file: string; line: number; code: string }

/**
 * The expression under any wrapping that does not change its value: brackets, a cast, a non-null mark, a leading
 * sign. `(0)`, `0 as number`, `-1` and `+(42)` are all the number a reader would see.
 */
function bare(node: ts.Expression): ts.Expression {
  let current = node;
  for (;;) {
    if (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isNonNullExpression(current)
      || ts.isSatisfiesExpression(current) || ts.isTypeAssertionExpression(current)) current = current.expression;
    else if (ts.isPrefixUnaryExpression(current)
      && (current.operator === ts.SyntaxKind.MinusToken || current.operator === ts.SyntaxKind.PlusToken)) current = current.operand;
    else return current;
  }
}

export function scan(file: string, source: string): Finding[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];
  const add = (rule: Finding['rule'], node: ts.Node) => {
    const code = node.getText(tree).replace(/\s+/g, ' ').trim().slice(0, 120);
    findings.push({ rule, file, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, code });
  };
  const visit = (node: ts.Node): void => {
    // A word of the text that is a figure on its own (42, $0.00, 87%). A digit inside a name is not: run-trace.v1,
    // OMN-19986.
    if (ts.isJsxText(node) && node.text.split(/\s+/).some((word) => FIGURE_WORD.test(word.replace(/^[([{"'“]+|[)\]}"'”.,;:!?]+$/g, '')))) add('S1', node);
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && FIGURE.test(node.text)) {
      // The first ancestor that is not a bracket or a cast around this text.
      let parent: ts.Node = node.parent;
      while (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isNonNullExpression(parent)
        || ts.isSatisfiesExpression(parent)) parent = parent.parent;
      const compared = ts.isBinaryExpression(parent) && [
        ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken,
      ].includes(parent.operatorToken.kind);
      const padding = ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)
        && ['padStart', 'padEnd'].includes(parent.expression.name.text);
      const unread = ts.isJsxAttribute(parent) && !READ_ATTRIBUTES.has(parent.name.getText(tree));
      const naming = (ts.isPropertyAssignment(parent) && parent.name === node) || ts.isLiteralTypeNode(parent)
        || ts.isCaseClause(parent) || ts.isImportDeclaration(parent) || ts.isElementAccessExpression(parent);
      if (!compared && !padding && !unread && !naming) add('S2', node);
    }
    if (ts.isBinaryExpression(node) && ts.isNumericLiteral(bare(node.right))
      && (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken || node.operatorToken.kind === ts.SyntaxKind.BarBarToken)) {
      add('S3', node);
    }
    if (ts.isJsxExpression(node) && node.expression && ts.isNumericLiteral(bare(node.expression))
      && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      add('S4', node);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return findings;
}

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
const rules = (source: string) => scan('planted.tsx', source).map((finding) => finding.rule);

describe('OMN-21015 U6: no figure on a local page that the runtime did not serve', () => {
  it('S5: every page source exists and is read as markup', () => {
    expect(PAGE_SOURCES.length).toBeGreaterThanOrEqual(4);
    for (const file of PAGE_SOURCES) {
      expect(`${file}: ${existsSync(resolve(process.cwd(), file))}`).toBe(`${file}: true`);
      let elements = 0;
      const tree = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const count = (node: ts.Node): void => { if (ts.isJsxOpeningLikeElement(node)) elements += 1; ts.forEachChild(node, count); };
      count(tree);
      expect(`${file}: ${elements > 0 ? 'markup' : 'NO MARKUP'}`).toBe(`${file}: markup`);
    }
  });

  it('S1 to S4: the page code holds no typed figure and turns no missing value into a number', () => {
    const found = PAGE_SOURCES.flatMap((file) => scan(file, read(file)))
      .filter((finding) => !NUMBER_FALLBACKS_READ.some((read) => finding.rule === 'S3' && finding.file === read.file && finding.code === read.code));
    expect(found.map((finding) => `${finding.rule} ${finding.file}:${finding.line} ${finding.code}`)).toEqual([]);
  });

  it('S3: every fallback on the read list is still in the code (the list only shrinks)', () => {
    for (const entry of NUMBER_FALLBACKS_READ) {
      const still = scan(entry.file, read(entry.file)).some((finding) => finding.rule === 'S3' && finding.code === entry.code);
      expect(`${entry.file}: ${entry.code}: ${still ? 'present' : 'GONE'}`).toBe(`${entry.file}: ${entry.code}: present`);
      expect(entry.why.length).toBeGreaterThan(20);
    }
  });

  it.each([
    ['S1', 'a figure typed into a paragraph', 'const A = () => <p>42</p>;'],
    ['S1', 'a price typed into a cell', 'const A = () => <td>$0.00</td>;'],
    ['S1', 'a figure beside words', 'const A = () => <p>Saved 87% this week</p>;'],
    ['S2', 'a figure returned as text', "function f(v: unknown) { return v ? String(v) : '0%'; }"],
    ['S2', 'a price kept as a fallback', "const fallback = '$0.00';"],
    ['S2', 'a figure in a label a reader reads', 'const A = () => <span title="1,204 tokens" />;'],
    ['S2', 'a figure in a template with no blanks', 'const text = `12 runs`;'],
    ['S3', 'a missing value read as 0', 'const spend = row.spend_usd ?? 0;'],
    ['S3', 'a falsy value read as 0', 'const count = row.count || 0;'],
    ['S4', 'a number straight into the markup', 'const A = () => <dd>{0}</dd>;'],
    // Found in review of 2dc622da: the same faults written with a sign, in brackets, or through a cast were missed.
    ['S4', 'a signed number into the markup', 'const A = () => <span>{-42}</span>;'],
    ['S4', 'a bracketed number into the markup', 'const A = () => <span>{(42)}</span>;'],
    ['S4', 'a cast number into the markup', 'const A = () => <span>{42 as number}</span>;'],
    ['S3', 'a missing value read as a bracketed 0', 'const A = ({ page }) => <span>{page?.missingValue ?? (0)}</span>;'],
    ['S3', 'a missing value read as a signed number', 'const count = row.count ?? -1;'],
    ['S3', 'a missing value read as a cast 0', 'const count = row.count || (0 as number);'],
    ['S2', 'a figure text behind brackets and a cast', "const A = () => <span>{('0%' as string)}</span>;"],
  ])('%s control: %s is refused', (rule, _name, source) => {
    expect(rules(source)).toContain(rule);
  });

  it.each([
    ['a comparison with a digit', "const zero = value === '0';"],
    ['a padded digit', "const two = String(n).padStart(2, '0');"],
    ['an icon size and a data attribute', 'const A = () => <Icon size="14" data-series="0" />;'],
    ['a number that is not a fallback', 'const width = share * 100;'],
    ['words with no digit', 'const A = () => <p>Not measured</p>;'],
    ['a digit inside a name', 'const A = () => <p>Not served yet: waits on local-identity.v1 (OMN-19986)</p>;'],
    ['a served value put into the markup', 'const A = ({ row }) => <dd>{row.tokens_input}</dd>;'],
    ['a case label', "function f(k: string) { switch (k) { case '1': return 'one'; default: return k; } }"],
    ['a comparison behind brackets', "const zero = value === ('0');"],
    ['a signed number that is arithmetic, not a fallback', 'const start = 25 - offset * 100;'],
    ['a negative index', 'const last = list.at(-1);'],
  ])('S6: %s is not refused', (_name, source) => {
    expect(scan('honest.tsx', source)).toEqual([]);
  });
});
