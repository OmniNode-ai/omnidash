/**
 * OMN-22168 AC4: the fact list of the local pages and Delegation Evidence, which replaces their hand-written <dl>. A fact
 * is a term and its value in one row; a page names the look and the kit owns the list's class, so the six lists the pages
 * drew (fields, provider facts, the inline provider facts, routing counts, provider figures, Evidence's claim derivation)
 * keep their markup and every class they had.
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import './fact-cards.css';

const LOOKS = {
  fields: 'local-dashboard-fields',
  provider: 'local-provider-facts',
  'provider-inline': 'local-provider-facts local-provider-facts--inline',
  'routing-counts': 'local-routing-counts',
  'provider-figures': 'local-provider-figures',
  'evidence-derivation': 'ev-evidence-derivation',
  // OMN-23330 (2026-11-11, "cards and make it great"): a run's facts as cards tinted by their fields (fact-cards.css).
  cards: 'ds-fact-cards',
} as const;
/** The class of the card look, for a fact list the kit's FactList does not draw (event-dash's KV). */
export const FACT_CARDS_CLASS = LOOKS.cards;
export type FactListLook = keyof typeof LOOKS;

export function FactList({ look = 'fields', className, children, ...rest }: {
  look?: FactListLook;
  /** A class the page adds beside the look's own (local-latest-primary, local-pricing-facts). */
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDListElement>, 'className' | 'children'>) {
  return <dl className={className ? `${LOOKS[look]} ${className}` : LOOKS[look]} {...rest}>{children}</dl>;
}

type DataAttributes = { [data: `data-${string}`]: unknown };

/** One fact: the term (its icon and words) and the value. The row keeps the page's data-* marks (tone, unavailable). */
export function Fact({ term, children, valueClassName, valueTitle, valueProps, style, ...row }: {
  term: ReactNode;
  children: ReactNode;
  /** The value's own class (mono, local-identity-value). */
  valueClassName?: string;
  /** The value's title, such as the served timestamp behind a readable time. */
  valueTitle?: string;
  /** data-* marks the value cell carries (the run's failure cause). */
  valueProps?: DataAttributes;
  /** The row's own style (a model row's identity colour). */
  style?: CSSProperties;
} & DataAttributes) {
  return <div style={style} {...row}><dt>{term}</dt><dd className={valueClassName} title={valueTitle} {...valueProps}>{children}</dd></div>;
}
