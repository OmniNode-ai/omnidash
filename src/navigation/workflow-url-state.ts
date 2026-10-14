import { PAGE_PATHS } from './page-routes';

const RUN_PARAM = 'correlation_id';

/** A typed or pasted run id as it is asked for: trimmed, and null when nothing is left. */
export function normaliseRunId(value: string | null | undefined): string | null {
  const id = (value ?? '').trim();
  return id === '' ? null : id;
}

/** WF-3: the run the Workflow address names, or null (the newest run) when it names none. */
export function readWorkflowRunId(search: string): string | null {
  return normaliseRunId(new URLSearchParams(search).get(RUN_PARAM));
}

/** Keep unrelated query parameters; no id means the parameter is absent, never empty. */
export function writeWorkflowRunId(search: string, runId: string | null): string {
  const params = new URLSearchParams(search);
  if (runId === null) params.delete(RUN_PARAM);
  else params.set(RUN_PARAM, runId);
  return params.toString();
}

/** The Workflow address for one run: the link a run in the Runs list carries. */
export function workflowHref(runId: string): string {
  return `${PAGE_PATHS['local-workflow']}?${writeWorkflowRunId('', runId)}`;
}
