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

const FROM_PARAM = 'from';

/**
 * OMN-24616 AC7: the Runs view a run was opened from, or null. Only this dashboard's own Runs address, bare or with its
 * query, is accepted, so a crafted value can send no one to another site or another page.
 */
export function runsViewOrNull(from: string | null | undefined): string | null {
  if (typeof from !== 'string') return null;
  const runs = PAGE_PATHS['local-runs'];
  return from === runs || from.startsWith(`${runs}?`) ? from : null;
}

/** OMN-24616 AC7: the Runs view the Workflow address says it was opened from, or null. */
export function readWorkflowFrom(search: string): string | null {
  return runsViewOrNull(new URLSearchParams(search).get(FROM_PARAM));
}

/**
 * OMN-24616 AC7: the Runs view a run link on the current page carries -- the Runs view itself on Runs, or the view the
 * Workflow address was opened from, so Newer run and Older run keep the way back -- and null anywhere else.
 */
export function runsViewToCarry(path: string, search: string): string | null {
  if (path === PAGE_PATHS['local-runs']) return runsViewOrNull(search ? `${path}?${search}` : path);
  if (path === PAGE_PATHS['local-workflow']) return readWorkflowFrom(search);
  return null;
}

/**
 * The Workflow address for one run: the link a run in the Runs list carries. OMN-24616 AC7: opened from Runs, it also
 * carries that Runs view, so the run page can lead back to the same filters.
 */
export function workflowHref(runId: string, from?: string | null): string {
  const params = new URLSearchParams(writeWorkflowRunId('', runId));
  const view = runsViewOrNull(from);
  if (view !== null) params.set(FROM_PARAM, view);
  return `${PAGE_PATHS['local-workflow']}?${params.toString()}`;
}
