/* eslint-disable local/no-typography-inline -- OMN-10509 keeps prototype primitive layout while source-level typography compliance is enforced separately. */
import type { ReactNode } from 'react';

export type NodeKind = 'orchestrator' | 'compute' | 'effect' | 'reducer' | 'cmd';

const NODE_COLORS: Record<NodeKind, { bg: string; fg: string; dot: string }> = {
  orchestrator: {
    bg: 'var(--orchestrator-soft)',
    fg: 'var(--orchestrator-ink)',
    dot: 'var(--orchestrator)',
  },
  compute: {
    bg: 'var(--compute-soft)',
    fg: 'var(--compute-ink)',
    dot: 'var(--compute)',
  },
  effect: {
    bg: 'var(--effect-soft)',
    fg: 'var(--effect-ink)',
    dot: 'var(--effect)',
  },
  reducer: {
    bg: 'var(--reducer-soft)',
    fg: 'var(--reducer-ink)',
    dot: 'var(--reducer)',
  },
  cmd: {
    bg: 'var(--accent-soft)',
    fg: 'var(--accent-ink)',
    dot: 'var(--accent)',
  },
};

export interface NodePillProps {
  kind: NodeKind;
  children?: ReactNode;
}

/**
 * NodePill -- color-coded pill showing a node type (orchestrator/compute/effect/reducer/cmd).
 * Matches the prototype's inline-style approach with the design token CSS variables.
 */
export function NodePill({ kind, children }: NodePillProps) {
  const colors = NODE_COLORS[kind] ?? NODE_COLORS.cmd;

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 20,
        padding: '0 8px',
        background: colors.bg,
        color: colors.fg,
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: colors.dot,
          flexShrink: 0,
        }}
      />
      {children ?? kind}
    </span>
  );
}
