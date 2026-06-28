import { useState } from 'react';
import { RotateCw, Square, Check, AlertCircle, Loader } from 'lucide-react';
import type { DispatchRequest } from './useDispatch';
import { useDispatch } from './useDispatch';

export type DispatchButtonVariant = 'rerun' | 'stop';

export interface DispatchButtonProps {
  variant: DispatchButtonVariant;
  targetNodeId: string;
  correlationId?: string;
}

type ButtonState = 'idle' | 'loading' | 'success' | 'error';

const ICON_SIZE = 12;

export function DispatchButton({ variant, targetNodeId, correlationId }: DispatchButtonProps) {
  const { dispatch } = useDispatch();
  const [state, setState] = useState<ButtonState>('idle');

  const isStop = variant === 'stop';

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state === 'loading') return;
    setState('loading');

    const req: DispatchRequest = isStop
      ? { command_type: 'cancel', target_node_id: targetNodeId, payload: { correlation_id: correlationId ?? '' } }
      : { command_type: 'run-node', target_node_id: targetNodeId, payload: {} };

    try {
      await dispatch(req);
      setState('success');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  };

  const icon = () => {
    if (state === 'loading') return <Loader size={ICON_SIZE} style={{ animation: 'spin 1s linear infinite' }} />;
    if (state === 'success') return <Check size={ICON_SIZE} />;
    if (state === 'error') return <AlertCircle size={ICON_SIZE} />;
    if (isStop) return <Square size={ICON_SIZE} />;
    return <RotateCw size={ICON_SIZE} />;
  };

  const baseColor = isStop ? 'var(--bad)' : 'var(--accent)';
  const stateColor = state === 'success' ? 'var(--good)' : state === 'error' ? 'var(--bad)' : baseColor;
  const isDisabled = state === 'loading';

  const title = isStop ? 'Stop this trace' : 'Re-run this trace';

  return (
    <button
      aria-label={isStop ? 'Stop trace' : 'Re-run trace'}
      title={title}
      disabled={isDisabled}
      onClick={(e) => { void handleClick(e); }}
      data-testid={`dispatch-button-${variant}`}
      style={{
        all: 'unset',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: 4,
        border: `1px solid ${isDisabled ? 'var(--line)' : stateColor}`,
        color: isDisabled ? 'var(--text-tertiary)' : stateColor,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
        transition: 'opacity 0.15s, border-color 0.15s, color 0.15s',
      }}
    >
      {icon()}
    </button>
  );
}
