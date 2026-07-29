import { useState } from 'react';
import { Text } from '@/components/ui/typography';
import { triggerDelegation } from '@/services/delegation-api';
import delegateSkillTaskTypeContract from '@shared/contracts/delegation-task-types.json';
import '../workbench-actions.css';

const DELEGATE_SKILL_TASK_TYPES = Object.freeze([...delegateSkillTaskTypeContract.task_types]);

function taskTypeDefinition(taskType: string) {
  const definition = DELEGATE_SKILL_TASK_TYPES.find((candidate) => candidate.id === taskType);
  if (!definition) {
    throw new Error(`Delegation task type "${taskType}" is missing from the shared task-type contract.`);
  }
  return definition;
}

const DEFAULT_TASK_TYPE = taskTypeDefinition('reasoning');

type TriggerState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'accepted'; correlationId: string; message?: string }
  | { phase: 'error'; message: string };

export function DelegationTriggerPanel({
  onCorrelationId,
  collapsible = true,
  initialPrompt = '',
}: {
  onCorrelationId?: (id: string) => void;
  collapsible?: boolean;
  initialPrompt?: string;
}) {
  const [open, setOpen] = useState(!collapsible);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [taskType, setTaskType] = useState(DEFAULT_TASK_TYPE.id);
  const [state, setState] = useState<TriggerState>({ phase: 'idle' });
  const selectedTaskType = taskTypeDefinition(taskType);

  async function handleSubmit() {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setState({ phase: 'submitting' });
    try {
      const result = await triggerDelegation({ prompt: trimmed, task_type: taskType });
      setState({ phase: 'accepted', correlationId: result.correlation_id, message: result.message });
      onCorrelationId?.(result.correlation_id);
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  function handleReset() {
    setState({ phase: 'idle' });
    setPrompt('');
  }

  if (collapsible && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          border: '1px solid var(--line)',
          borderRadius: 6,
          padding: '5px 10px',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
        }}
      >
        <Text as="span" size="xs" color="primary">+ Trigger delegation</Text>
      </button>
    );
  }

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        background: 'var(--panel-1)',
      }}
    >
      {collapsible && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text as="span" size="sm" weight="semibold" color="primary">Trigger delegation</Text>
          <button
            type="button"
            aria-label="Close delegation form"
            disabled={state.phase === 'submitting'}
            onClick={() => { setOpen(false); handleReset(); }}
            style={{
              border: 0,
              background: 'transparent',
              cursor: state.phase === 'submitting' ? 'not-allowed' : 'pointer',
              color: 'inherit',
              opacity: state.phase === 'submitting' ? 0.5 : 1,
            }}
          >
            <Text as="span" size="xs" color="tertiary">✕</Text>
          </button>
        </div>
      )}

      {state.phase === 'accepted' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Text as="div" size="sm" color="ok">Accepted</Text>
          <Text as="div" size="xs" color="tertiary">
            {state.message ?? 'Delegation command dispatched.'}
          </Text>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Text as="div" size="xs" color="tertiary">correlation_id</Text>
            <Text as="div" size="sm" family="mono" color="primary" style={{ overflowWrap: 'break-word' }}>
              {state.correlationId}
            </Text>
          </div>
          <Text as="div" size="xs" color="secondary">
            Correlation Trace tab now shows this run. Events appear once the runtime processes the command.
          </Text>
          <button
            type="button"
            onClick={handleReset}
            style={{
              alignSelf: 'flex-start',
              border: '1px solid var(--line)',
              borderRadius: 6,
              padding: '4px 10px',
              background: 'transparent',
              cursor: 'pointer',
              color: 'inherit',
            }}
          >
            <Text as="span" size="xs" color="primary">Trigger another</Text>
          </button>
        </div>
      ) : (
        <>
          <div className="workbench-delegation-fields">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '0 0 180px' }}>
              <label htmlFor="delegate-task-type">
                <Text as="span" size="xs" color="tertiary">Task type</Text>
              </label>
              <select
                id="delegate-task-type"
                value={taskType}
                onChange={(e) => setTaskType(e.target.value)}
                disabled={state.phase === 'submitting'}
                aria-describedby="delegate-task-type-description"
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 6,
                  padding: '5px 8px',
                  background: 'var(--panel-2)',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {DELEGATE_SKILL_TASK_TYPES.map((taskTypeOption) => (
                  <option key={taskTypeOption.id} value={taskTypeOption.id}>
                    {taskTypeOption.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <label htmlFor="delegate-task-prompt">
                <Text as="span" size="xs" color="tertiary">Prompt</Text>
              </label>
              <textarea
                id="delegate-task-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={selectedTaskType.prompt_placeholder}
                disabled={state.phase === 'submitting'}
                rows={3}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 6,
                  padding: '6px 8px',
                  background: 'var(--panel-2)',
                  color: 'inherit',
                  resize: 'vertical',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <Text
            id="delegate-task-type-description"
            as="div"
            size="xs"
            color="secondary"
            aria-live="polite"
          >
            {selectedTaskType.description}
          </Text>

          {state.phase === 'error' && (
            <Text as="div" size="xs" color="bad">
              {state.message}
            </Text>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={state.phase === 'submitting' || !prompt.trim()}
              className="btn primary workbench-action-button"
              aria-label="Delegate"
            >
              {state.phase === 'submitting' ? 'Delegating…' : 'Delegate'}
            </button>
            <Text as="span" size="xs" color="tertiary">
              Results and failures appear in the System Event Stream.
            </Text>
          </div>
        </>
      )}
    </div>
  );
}
