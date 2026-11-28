import { Children, isValidElement, useState, type ReactElement, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Highlight, type PrismTheme } from 'prism-react-renderer';
import { Check, Copy } from '@/theme/design-system/icons';
import { MermaidDiagram } from './safe-markdown-diagram';

/**
 * OMN-26646: a run's answer or prompt as markdown with raw HTML switched off. This replaces OMN-21166 AC6's "never a
 * markdown renderer" and keeps its aim: markup inside an answer creates no element.
 *  - no rehype-raw, so `<script>`, `<img>`, `<iframe>` and the rest stay the text they were written as;
 *  - a link keeps its href only for http, https and mailto, any other becomes plain text;
 *  - an image is never rendered, so no image address is fetched; its alt text shows instead;
 *  - a fenced block shows its language and a copy button that copies the code between the fences, and ```mermaid is
 *    drawn as a diagram in omnidash's own colours (safe-markdown-diagram.tsx).
 */

const ALLOWED_LINK = /^(https?:|mailto:)/i;
/** Anything that is not http, https or mailto is dropped, a relative address too: an answer has no page to be relative to. */
const allowedUrl = (url: string): string => (ALLOWED_LINK.test(url.trim()) ? url : '');

/** Syntax colours are design tokens read by the browser when it paints, so a theme switch needs no redraw and nothing is written here. */
const TOKEN_THEME: PrismTheme = {
  plain: { color: 'var(--ds-ink)' },
  styles: [
    { types: ['comment', 'prolog', 'doctype', 'cdata'], style: { color: 'var(--ds-ink-3)', fontStyle: 'italic' } },
    { types: ['keyword', 'selector', 'important', 'atrule', 'tag'], style: { color: 'var(--ds-chart-6)' } },
    { types: ['string', 'attr-value', 'char', 'template-string'], style: { color: 'var(--ds-chart-2)' } },
    { types: ['number', 'boolean', 'constant', 'symbol'], style: { color: 'var(--ds-chart-3)' } },
    { types: ['function', 'class-name', 'builtin'], style: { color: 'var(--ds-chart-1)' } },
    { types: ['property', 'attr-name', 'variable'], style: { color: 'var(--ds-chart-7)' } },
    { types: ['operator', 'punctuation'], style: { color: 'var(--ds-ink-3)' } },
    { types: ['deleted'], style: { color: 'var(--ds-chart-4)' } },
    { types: ['inserted'], style: { color: 'var(--ds-chart-2)' } },
  ],
};

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { setCopied(false); }
  };
  return <div className="workflow-answer-codeblock">
    <div className="workflow-answer-codebar">
      <span className="workflow-answer-codelang">{language || 'text'}</span>
      <button type="button" className="workflow-answer-copy" onClick={copy} aria-label={copied ? 'Copied' : 'Copy code'}>
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}{copied ? 'Copied' : 'Copy'}
      </button>
    </div>
    <Highlight code={code} language={language || 'text'} theme={TOKEN_THEME}>
      {({ tokens, getLineProps, getTokenProps }) => <pre className="workflow-answer-code"><code>
        {tokens.map((line, index) => <span key={index} {...getLineProps({ line })}>
          {line.map((token, tokenIndex) => <span key={tokenIndex} {...getTokenProps({ token })} />)}{index < tokens.length - 1 ? '\n' : null}
        </span>)}
      </code></pre>}
    </Highlight>
  </div>;
}

const COMPONENTS: Components = {
  // A fenced block arrives as <pre><code class="language-x">; inline code stays an inline <code>.
  pre({ children }) {
    const only = Children.toArray(children)[0];
    if (!isValidElement(only)) return <pre>{children}</pre>;
    const { className, children: inner } = (only as ReactElement<{ className?: string; children?: ReactNode }>).props;
    const language = /language-([^\s]+)/.exec(className ?? '')?.[1] ?? '';
    // The fence's own closing newline is not part of the code: copy exactly what sits between the fences.
    const code = String(inner ?? '').replace(/\n$/, '');
    return language.toLowerCase() === 'mermaid' ? <MermaidDiagram source={code} /> : <CodeBlock code={code} language={language} />;
  },
  a({ href, children }) {
    return href ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> : <span>{children}</span>;
  },
  img({ alt }) { return <>{alt ?? ''}</>; },
  table({ children }) { return <div className="workflow-answer-table"><table>{children}</table></div>; },
};

export function SafeMarkdown({ text }: { text: string }) {
  return <div className="workflow-answer-markdown">
    <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={allowedUrl} components={COMPONENTS}>{text}</ReactMarkdown>
  </div>;
}
