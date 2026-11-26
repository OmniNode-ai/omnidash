/**
 * Scans src/pages/local/delegation-quality.tsx for words or colours written directly in page code.
 * Failure modes: L1 a word typed into the section's markup or into a read attribute (aria-label, title, label, placeholder, alt); L2 a word kept in a string the section can show; L3 a colour written in the file (hex, rgb(), hsl(), a named colour) instead of a design-system class or token; L4 the instrument is blind (each planted fault is seen).
 * It cannot see: a word assembled at run time from served values.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const FILE = 'src/pages/local/delegation-quality.tsx';

export interface Literal { kind: 'word' | 'colour'; line: number; text: string }

const WORD = /[A-Za-z]{2,}/;
const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(|\b(?:red|green|blue|black|white|orange|yellow|purple|grey|gray|pink)\b/i;

export function literals(file: string, source: string): Literal[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Literal[] = [];

  function lineOf(node: ts.Node): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  }

  function isSkipped(node: ts.Node): boolean {
    const parent = node.parent;
    if (!parent) return false;

    if ((ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) && parent.moduleSpecifier === node) {
      return true;
    }

    if (ts.isJsxAttribute(parent) && parent.initializer === node) {
      const nameNode = parent.name;
      const name = ts.isIdentifier(nameNode)
        ? nameNode.text
        : ts.isJsxNamespacedName(nameNode)
          ? nameNode.name.text
          : '';
      if (name === 'className' || name === 'key' || name === 'scope' || name === 'role' || name === 'type' || name.startsWith('data-')) {
        return true;
      }
    }

    if (ts.isBinaryExpression(parent) && (parent.left === node || parent.right === node)) {
      const other = parent.left === node ? parent.right : parent.left;
      const operator = parent.operatorToken.kind;
      if (
        (operator === ts.SyntaxKind.EqualsEqualsToken ||
          operator === ts.SyntaxKind.EqualsEqualsEqualsToken ||
          operator === ts.SyntaxKind.ExclamationEqualsToken ||
          operator === ts.SyntaxKind.ExclamationEqualsEqualsToken) &&
        other.kind === ts.SyntaxKind.TypeOfExpression
      ) {
        return true;
      }
    }

    if (
      (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isPropertyDeclaration(parent)) &&
      parent.name === node
    ) {
      return true;
    }

    return false;
  }

  function scan(node: ts.Node, text: string): void {
    if (isSkipped(node)) return;
    if (COLOUR.test(text)) {
      findings.push({ kind: 'colour', line: lineOf(node), text });
    } else if (WORD.test(text)) {
      findings.push({ kind: 'word', line: lineOf(node), text });
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isJsxText(node)) {
      const text = node.text.trim();
      if (WORD.test(text)) {
        findings.push({ kind: 'word', line: lineOf(node), text });
      }
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      scan(node, node.text);
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      scan(node, node.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

describe('delegation-quality literals (OMN-26623)', () => {
  it('the section file holds no word or colour of its own', () => {
    expect(literals(FILE, readFileSync(resolve(process.cwd(), FILE), 'utf8'))).toEqual([]);
  });

  it('control: a planted word in the markup is found (L1, L4)', () => {
    const source = readFileSync(resolve(process.cwd(), FILE), 'utf8');
    const changed = source.replace('</section>', '<p>Delegation</p></section>');
    expect(changed).not.toBe(source);
    expect(literals(FILE, changed).some((finding) => finding.kind === 'word' && finding.text.includes('Delegation'))).toBe(true);
  });

  it('control: a planted word in a read attribute is found', () => {
    const source = readFileSync(resolve(process.cwd(), FILE), 'utf8');
    const changed = source.replace('<section ', '<section title="Weekly quality" ');
    expect(changed).not.toBe(source);
    expect(literals(FILE, changed)).toContainEqual(expect.objectContaining({ kind: 'word', text: 'Weekly quality' }));
  });

  it('control: a planted word in a string the section shows is found (L2)', () => {
    const source = readFileSync(resolve(process.cwd(), FILE), 'utf8');
    const changed = `${source}\nexport const PLANTED = 'no runs yet';\n`;
    expect(literals(FILE, changed)).toContainEqual(expect.objectContaining({ kind: 'word', text: 'no runs yet' }));
  });

  it('control: a planted colour is found (L3)', () => {
    const source = readFileSync(resolve(process.cwd(), FILE), 'utf8');
    const changedStyle = source.replace('<section ', "<section style={{ color: '#ff0000' }} ");
    expect(changedStyle).not.toBe(source);
    expect(literals(FILE, changedStyle)).toContainEqual(expect.objectContaining({ kind: 'colour', text: '#ff0000' }));

    const changedTone = `${source}\nexport const TONE = 'rgb(1, 2, 3)';\n`;
    expect(literals(FILE, changedTone).some((finding) => finding.kind === 'colour' && finding.text.includes('rgb(1, 2, 3)'))).toBe(true);
  });

  it('honest code is not refused', () => {
    expect(literals('x.tsx', "import { a } from './b';\nconst k = typeof v === 'string';\nexport const C = () => <div className=\"local-dashboard-toggles\" data-week=\"w\" scope=\"col\" />;\n")).toEqual([]);
  });
});
