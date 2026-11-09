/**
 * OMN-23330 AC27 (operator 2026-11-09: "why small text not colorsed - use color ... different for different purpose
 * and vice versa"): a headline card's caption draws each figure and named thing in the colour of the concept it names,
 * from the shared field-tone palette, so one concept has one colour on every page and two concepts never share one.
 * Connecting words stay in the caption's neutral colour. The text itself is unchanged; only its parts are toned.
 */
import type { ReactNode } from 'react';

/** The caption concepts, each one of the field tones in src/styles/field-identity.css. */
export type CaptionTone = 'cost' | 'baseline' | 'calls' | 'count' | 'pass' | 'fail' | 'run-unknown' | 'duration';

export interface CaptionPart { text: string; tone?: CaptionTone }

const N = String.raw`\d[\d,]*(?:\.\d+)?[KMB]?`;
const NOT_RECORDED = 'Not recorded';
/** States in a model's place, not model names: they stay neutral. */
const NO_MODEL = new Set([NOT_RECORDED, 'unresolved', 'Not measured']);

function plain(text: string): CaptionPart[] { return text === '' ? [] : [{ text }]; }

/** "86 runs without token counts, 3 runs without spend": each count is the unknown-run tone. */
function unknownRunCounts(text: string): CaptionPart[] {
  const parts: CaptionPart[] = [];
  let last = 0;
  for (const match of text.matchAll(new RegExp(`(${N})(?= runs? without )`, 'g'))) {
    parts.push(...plain(text.slice(last, match.index)), { text: match[1]!, tone: 'run-unknown' });
    last = match.index! + match[1]!.length;
  }
  return [...parts, ...plain(text.slice(last))];
}

/** A caption line split into its neutral words and its toned figures and names. An unknown line is one neutral part. */
export function captionParts(line: string): CaptionPart[] {
  let match: RegExpExecArray | null;
  if ((match = /^What you paid(.*)$/.exec(line))) return [{ text: 'What you paid', tone: 'cost' }, ...plain(match[1]!)];
  if ((match = /^(Modelled vs |vs |Baseline )(.+?)( · pricing .*)?$/.exec(line)) && !NO_MODEL.has(match[2]!)) {
    return [{ text: match[1]! }, { text: match[2]!, tone: 'baseline' }, ...plain(match[3] ?? '')];
  }
  if ((match = /^(Modelled at )(.+?)( prices\..*)$/.exec(line)) && !NO_MODEL.has(match[2]!)) {
    return [{ text: match[1]! }, { text: match[2]!, tone: 'baseline' }, { text: match[3]! }];
  }
  if ((match = new RegExp(`^(${N}) of (${N}) (runs measured|runs passed the quality gate)$`).exec(line))) {
    return [{ text: match[1]!, tone: match[3] === 'runs measured' ? 'calls' : 'pass' }, { text: ' of ' },
      { text: match[2]!, tone: 'count' }, { text: ` ${match[3]}` }];
  }
  if ((match = new RegExp(`^(${N})( failed)(.*)$`).exec(line))) return [{ text: match[1]!, tone: 'fail' }, { text: match[2]! }, ...plain(match[3]!)];
  if ((match = new RegExp(`^Of (${N}) runs$`).exec(line))) return [{ text: 'Of ' }, { text: match[1]!, tone: 'count' }, { text: ' runs' }];
  if ((match = new RegExp(`^(Unknown-(?:token|spend) runs excluded: )(${N})$`).exec(line))) {
    return [{ text: match[1]! }, { text: match[2]!, tone: 'run-unknown' }];
  }
  if ((match = /^avg (.+?) latency$/.exec(line)) && match[1] !== NOT_RECORDED) {
    return [{ text: 'avg ' }, { text: match[1]!, tone: 'duration' }, { text: ' latency' }];
  }
  if (line.startsWith('Not counted: ')) return [{ text: 'Not counted: ' }, ...unknownRunCounts(line.slice('Not counted: '.length))];
  return [{ text: line }];
}

export function captionNodes(line: string): ReactNode[] {
  return captionParts(line).map((part, index) => (part.tone
    ? <span key={index} className="local-caption-tone" data-field-tone={part.tone}>{part.text}</span>
    : part.text));
}

/** One caption line under a headline card's figure, toned by captionParts. */
export function CaptionLine({ line }: { line: string }) {
  return <p className="local-dashboard-caption">{captionNodes(line)}</p>;
}
