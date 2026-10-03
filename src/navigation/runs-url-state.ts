export interface RunsViewState {
  status: string;
  cause: string;
  model: string;
  span: string;
  page: number;
}

export const DEFAULT_RUNS_VIEW: RunsViewState = { status: 'all', cause: 'all', model: 'all', span: 'all', page: 1 };

export function readRunsSearch(search: string): RunsViewState {
  const params = new URLSearchParams(search);
  const status = params.get('status') ?? 'all';
  const rawPage = params.get('page') ?? '1';
  const page = /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  return {
    status: ['all', 'passed', 'failed', 'Not recorded'].includes(status) ? status : 'all',
    cause: params.get('cause') || 'all',
    model: params.get('model') || 'all',
    span: params.get('window') === 'today' ? 'today' : 'all',
    page: Number.isSafeInteger(page) ? page : 1,
  };
}

/** Keep unrelated query parameters and omit defaults, producing shareable URLs. */
export function writeRunsSearch(search: string, view: RunsViewState): string {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries({ status: view.status, cause: view.cause, model: view.model, window: view.span })) {
    if (value === 'all') params.delete(key);
    else params.set(key, value);
  }
  if (view.page === 1) params.delete('page');
  else params.set('page', String(view.page));
  return params.toString();
}
