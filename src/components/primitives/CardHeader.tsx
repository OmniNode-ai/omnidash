/* eslint-disable local/no-typography-inline -- OMN-10509 keeps prototype primitive layout while source-level typography compliance is enforced separately. */
import type { ReactNode } from 'react';

export interface CardHeaderProps {
  eyebrow?: string;
  title?: string;
  sub?: string;
  right?: ReactNode;
}

/**
 * CardHeader -- section header with eyebrow label, title, subtitle, and optional right slot.
 */
export function CardHeader({ eyebrow, title, sub, right }: CardHeaderProps) {
  return (
    <div className="card-hd">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        {title && (
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{title}</div>
        )}
        {sub && (
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4, fontStyle: 'italic' }}>
            {sub}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}
