import { useEffect, useId, useRef, useState } from 'react';
import { useThemeName } from '@/theme/useThemeName';

/**
 * OMN-26646: a ```mermaid block drawn in omnidash's own colours. The diagram library is imported only when a block is
 * on the page (a plain answer never loads it), runs at its strict security level with plain-text labels so a label can
 * carry no link, script or HTML, and takes every colour from the design tokens as the page resolves them at draw time
 * (so light and dark both apply, and a theme switch redraws). No colour value is written here: a token that cannot be
 * read means the diagram is not drawn and its source is shown as code, never a guessed colour.
 */

/** Token name by the diagram colour it supplies. Names confirmed against src/theme/design-system/tokens.css. */
const INK = '--ds-ink';
const INK_MUTED = '--ds-ink-3';
const BRAND = '--ds-brand';
const GRID = '--ds-chart-grid';
const SERIES = Array.from({ length: 8 }, (_, index) => `--ds-chart-${index + 1}`);
const TOKEN_NAMES = [INK, INK_MUTED, BRAND, GRID, ...SERIES];

/** A token as a colour a diagram library parses: a plain rgb or hex value as it is, any other notation as the page paints it. */
function paint(value: string): string {
  if (/^(rgb|#)/i.test(value)) return value;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext?.('2d');
  if (!context) return value;
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  return `#${[red, green, blue, ...(alpha === 255 ? [] : [alpha])].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** Every token the diagram needs, read from the page now; null when any one cannot be read. */
function readTokens(): Record<string, string> | null {
  const style = getComputedStyle(document.documentElement);
  const tokens: Record<string, string> = {};
  for (const name of TOKEN_NAMES) {
    const value = style.getPropertyValue(name).trim();
    if (!value) return null;
    tokens[name] = paint(value);
  }
  return tokens;
}

function themeVariables(token: Record<string, string>): Record<string, string> {
  const series = SERIES.map((name) => token[name]);
  return {
    primaryColor: token[GRID], primaryBorderColor: series[0], primaryTextColor: token[INK],
    secondaryColor: token[GRID], secondaryBorderColor: series[1], secondaryTextColor: token[INK],
    tertiaryColor: token[GRID], tertiaryBorderColor: series[2], tertiaryTextColor: token[INK],
    mainBkg: token[GRID], nodeBorder: series[0], nodeTextColor: token[INK],
    clusterBkg: token[GRID], clusterBorder: token[BRAND],
    lineColor: token[INK_MUTED], textColor: token[INK], titleColor: token[INK],
    edgeLabelBackground: token[GRID],
    noteBkgColor: token[GRID], noteBorderColor: token[BRAND], noteTextColor: token[INK],
    actorBkg: token[GRID], actorBorder: series[0], actorTextColor: token[INK], actorLineColor: token[INK_MUTED],
    signalColor: token[INK_MUTED], signalTextColor: token[INK],
    ...Object.fromEntries(series.flatMap((colour, index) => [[`pie${index + 1}`, colour], [`cScale${index}`, colour]])),
  };
}

/** The drawn svg as nodes, with anything that could act removed even though strict mode already sanitised it. */
function drawnSvg(svg: string): Element | null {
  const root = new DOMParser().parseFromString(svg, 'text/html').body.querySelector('svg');
  if (!root) return null;
  root.querySelectorAll('script, foreignObject, iframe, img, object, embed').forEach((element) => element.remove());
  // A link a diagram might carry keeps its drawn node but loses the link.
  root.querySelectorAll('a').forEach((link) => link.replaceWith(...Array.from(link.childNodes)));
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name) || /javascript:/i.test(attribute.value)) element.removeAttribute(attribute.name);
    }
  }
  return document.importNode(root, true);
}

/** One id for every draw: two draws in flight (a re-draw on a theme change, a development double mount) must not share one. */
let drawCount = 0;

type Drawn = { kind: 'drawing' } | { kind: 'drawn' } | { kind: 'source' } | { kind: 'failed' };

export function MermaidDiagram({ source }: { source: string }) {
  const theme = useThemeName();
  const id = `diagram-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<Drawn>({ kind: 'drawing' });

  useEffect(() => {
    let current = true;
    const tokens = readTokens();
    if (!tokens) { setState({ kind: 'source' }); return () => { current = false; }; }
    setState({ kind: 'drawing' });
    (async () => {
      try {
        const { default: mermaid } = await import('mermaid');
        mermaid.initialize({
          startOnLoad: false, securityLevel: 'strict', htmlLabels: false, flowchart: { htmlLabels: false },
          theme: 'base', themeVariables: themeVariables(tokens),
        });
        const { svg } = await mermaid.render(`${id}-${++drawCount}`, source);
        const node = drawnSvg(svg);
        if (!current) return;
        if (!node || !host.current) { setState({ kind: 'failed' }); return; }
        host.current.replaceChildren(node);
        setState({ kind: 'drawn' });
      } catch {
        if (current) setState({ kind: 'failed' });
      }
    })();
    return () => { current = false; };
  }, [source, theme, id]);

  const code = <pre className="workflow-answer-code"><code>{source}</code></pre>;
  if (state.kind === 'source') return code;
  if (state.kind === 'failed') return <div className="workflow-answer-diagram-failed"><p className="local-dashboard-caption">The page could not draw this diagram, so its source is shown.</p>{code}</div>;
  return <div className="workflow-answer-diagram" data-diagram={state.kind} ref={host} aria-label="Diagram" role="img" />;
}
