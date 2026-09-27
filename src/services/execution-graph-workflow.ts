import type { ExecutionGraphTransport } from '@/components/dashboard/delegation-control-plane/execution-graph-spike/ExecutionGraphTransport';
import type { ModelExecutionGraph } from '@/components/dashboard/delegation-control-plane/execution-graph-spike/render-model';

const WORKFLOW_TYPE = 'delegation-execution-graph-read';
const POLL_ATTEMPTS = 20;
const POLL_INTERVAL_MS = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGraph(value: unknown, correlationId: string): value is ModelExecutionGraph {
  if (!isRecord(value) || value.schema_version !== 1 || !isRecord(value.replay)
    || value.replay.correlation_id !== correlationId || !Array.isArray(value.replay.nodes)
    || !Array.isArray(value.replay.edges) || !Array.isArray(value.replay.order)
    || !Array.isArray(value.replay.source_cursors) || !Array.isArray(value.replay.verdicts)
    || !Array.isArray(value.replay.unresolved) || !isRecord(value.replay.anchor)
    || !Array.isArray(value.labels) || !isRecord(value.annotations)
    || !Array.isArray(value.annotations.stored_chain)) return false;
  return value.replay.source_cursors.every((cursor: unknown) => isRecord(cursor)
    && typeof cursor.topic === 'string' && cursor.topic.length > 0
    && Number.isInteger(cursor.partition) && Number(cursor.partition) >= 0
    && Number.isInteger(cursor.max_ingest_watermark) && Number(cursor.max_ingest_watermark) >= 1);
}

export interface ExecutionGraphWorkflowDeps {
  fetchImpl?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
}

/** Browser transport only talks to the same-origin, session-authenticated BFF. */
export function createLiveExecutionGraphTransport(deps: ExecutionGraphWorkflowDeps = {}): ExecutionGraphTransport {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); }));

  return {
    async readLatest(correlationId) {
      if (!UUID.test(correlationId)) throw new Error('A canonical delegation correlation is required.');
      let submitted: Response;
      try {
        submitted = await fetchImpl('/api/workflow-reads', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ correlation_id: correlationId, payload: { cursor_mode: 'latest' } }),
        });
      } catch {
        throw new Error('Authorized graph read is unavailable.');
      }
      if (submitted.status !== 202) throw new Error('Authorized graph read was refused or is unavailable.');
      let ack: unknown;
      try {
        ack = await submitted.json();
      } catch {
        throw new Error('Graph read acknowledgement is invalid.');
      }
      if (!isRecord(ack) || typeof ack.workflow_id !== 'string' || !UUID.test(ack.workflow_id)
        || ack.correlation_id !== correlationId) {
        throw new Error('Graph read acknowledgement is invalid.');
      }
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        let response: Response;
        try {
          response = await fetchImpl(`/api/workflow-reads/${ack.workflow_id}/result`, {
            method: 'GET', credentials: 'same-origin',
          });
        } catch {
          throw new Error('Authorized graph result is unavailable.');
        }
        if (response.status === 409) {
          if (attempt + 1 < POLL_ATTEMPTS) await wait(POLL_INTERVAL_MS);
          continue;
        }
        if (!response.ok) throw new Error('Authorized graph result was refused or is unavailable.');
        let terminal: unknown;
        try {
          terminal = await response.json();
        } catch {
          throw new Error('Graph result is invalid.');
        }
        if (!isRecord(terminal) || terminal.workflow_id !== ack.workflow_id
          || terminal.workflow_type !== WORKFLOW_TYPE) throw new Error('Graph result is invalid.');
        if (terminal.status === 'failed' && isRecord(terminal.refusal) && terminal.result === null) {
          throw new Error('Execution graph correlation was not found or could not be read.');
        }
        if (terminal.status !== 'completed' || terminal.refusal !== null
          || !isGraph(terminal.result, correlationId)) throw new Error('Graph result is invalid.');
        return terminal.result;
      }
      throw new Error('Graph read did not return a verified result in time.');
    },
  };
}
