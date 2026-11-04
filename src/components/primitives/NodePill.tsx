/* eslint-disable local/no-typography-inline -- OMN-10509 keeps prototype primitive layout while source-level typography compliance is enforced separately. */
import type { ReactNode } from 'react';

export type NodeKind = 'orchestrator' | 'compute' | 'effect' | 'reducer' | 'cmd';

const NODE_COLORS: Record<NodeKind, { bg: string; fg: string; dot: string }> = {
  orchestrator: {
    bg: 'var(--ds-kind-orchestrator-soft)',
    fg: 'var(--ds-kind-orchestrator-ink)',
    dot: 'var(--ds-kind-orchestrator)',
  },
  compute: {
    bg: 'var(--ds-kind-compute-soft)',
    fg: 'var(--ds-kind-compute-ink)',
    dot: 'var(--ds-kind-compute)',
  },
  effect: {
    bg: 'var(--ds-kind-effect-soft)',
    fg: 'var(--ds-kind-effect-ink)',
    dot: 'var(--ds-kind-effect)',
  },
  reducer: {
    bg: 'var(--ds-kind-reducer-soft)',
    fg: 'var(--ds-kind-reducer-ink)',
    dot: 'var(--ds-kind-reducer)',
  },
  cmd: {
    bg: 'var(--ds-brand-soft)',
    fg: 'var(--ds-link)',
    dot: 'var(--ds-brand)',
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
