import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExecutionGraphView } from './ExecutionGraphView';
import type { DelegationRun } from '../delegation-control-plane.types';

/** Presentation-only workspace; all graph evidence still comes from the transport. */
export function ExecutionGraphWorkspace({ correlationId, isFixture, runs = [], onExit }: { correlationId: string; isFixture: boolean; runs?: DelegationRun[]; onExit?: () => void }) {
  const [open, setOpen] = useState(true);
  const [activeCorrelation, setActiveCorrelation] = useState(correlationId);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const close = () => { setOpen(false); onExit?.(); };
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  return <>
    <button type="button" className="execution-graph-open" onClick={() => setOpen(true)}>Open full-screen execution graph</button>
    {open && createPortal(
      <dialog ref={dialog} className="execution-graph-workspace" aria-labelledby={titleId} onCancel={close}>
        <header className="execution-graph-workspace__header">
          <div>
            <h1 id={titleId}>Execution graph</h1>
            <p>{isFixture ? 'Fixture data' : 'Recorded events · authorized live read'} · {activeCorrelation}</p>
          </div>
          {runs.length > 0 && <label>
            Recorded execution
            <select aria-label="Recorded execution" value={activeCorrelation} onChange={(event) => setActiveCorrelation(event.target.value)}>
              {!runs.some((run) => run.correlationId === correlationId) && <option value={correlationId}>{correlationId}</option>}
              {runs.map((run) => <option key={run.correlationId} value={run.correlationId}>{run.taskType} · {run.correlationId}</option>)}
            </select>
          </label>}
          <button type="button" autoFocus onClick={close}>Back to dashboard</button>
        </header>
        <ExecutionGraphView correlationId={activeCorrelation} fullScreen />
      </dialog>, document.body)}
  </>;
}
