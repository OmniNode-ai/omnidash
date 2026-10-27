export interface RunsViewState {
  status: string;
  cause: string;
  model: string;
  backend: string;
  span: string;
  page: number;
  day?: string;
  task?: string;
  /** OMN-21166 part 23 AC145: a served cost_tier_name; absent means every tier. */
  tier?: string;
  query?: string;
  /** OMN-21166 AC75: a column sort; absent means the served newest-first order. */
  sort?: 'created' | 'duration' | 'cost';
  dir?: 'asc' | 'desc';
}

export const DEFAULT_RUNS_VIEW: RunsViewState = { status: 'all', cause: 'all', model: 'all', backend: 'all', span: 'all', page: 1 };

export function readRunsSearch(search: string): RunsViewState {
  const params = new URLSearchParams(search);
  const status = params.get('status') ?? 'all';
  const rawPage = params.get('page') ?? '1';
  const page = /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  return {
    status: ['all', 'passed', 'failed', 'Not recorded'].includes(status) ? status : 'all',
    cause: params.get('cause') || 'all',
    model: params.get('model') || 'all',
    backend: params.get('backend') || 'all',
    span: params.get('window') === 'today' ? 'today' : 'all',
    page: Number.isSafeInteger(page) ? page : 1,
    ...(params.get('day') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('day')!) ? { day: params.get('day')! } : {}),
    ...(params.get('task') ? { task: params.get('task')! } : {}),
    ...(params.get('tier') ? { tier: params.get('tier')! } : {}),
    ...(params.get('q') ? { query: params.get('q')! } : {}),
    ...(['created', 'duration', 'cost'].includes(params.get('sort') ?? '')
      ? { sort: params.get('sort') as 'created' | 'duration' | 'cost', dir: params.get('dir') === 'asc' ? 'asc' as const : 'desc' as const } : {}),
  };
}

/** Keep unrelated query parameters and omit defaults, producing shareable URLs. */
export function writeRunsSearch(search: string, view: RunsViewState): string {
  const params = new URLSearchParams(search);
  if (view.query) params.set('q', view.query);
  else params.delete('q');
  for (const [key, value] of Object.entries({ status: view.status, cause: view.cause, model: view.model, backend: view.backend, window: view.span })) {
    if (value === 'all') params.delete(key);
    else params.set(key, value);
  }
  if (view.day) params.set('day', view.day);
  else params.delete('day');
  if (view.task && view.task !== 'all') params.set('task', view.task);
  else params.delete('task');
  if (view.tier && view.tier !== 'all') params.set('tier', view.tier);
  else params.delete('tier');
  if (view.sort) { params.set('sort', view.sort); params.set('dir', view.dir ?? 'desc'); }
  else { params.delete('sort'); params.delete('dir'); }
  if (view.page === 1) params.delete('page');
  else params.set('page', String(view.page));
  return params.toString();
}
