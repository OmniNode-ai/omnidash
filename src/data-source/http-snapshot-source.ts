import type {
  ProjectionDataFreshness,
  ProjectionSnapshot,
  ProtocolSnapshotSource,
} from './protocol-snapshot-source';
import { authedFetch } from './authed-fetch';
import { resolveTenantFor, TenantNotConfiguredError } from './projection-tenant';

export interface HttpSnapshotSourceOptions { baseUrl: string; }

/**
 * A projection read the backend answered with a non-2xx status. `code` is the backend's named refusal (the
 * read node's contract declares them: `projection_table_missing`, `tenant_conflict`, ...) when its body carries one.
 */
export class ProjectionReadRefusedError extends Error {
  constructor(
    readonly topic: string,
    readonly status: number,
    statusText: string,
    readonly code: string | null,
  ) {
    super(`Projection ${topic} failed: HTTP ${status} ${statusText}`.trim());
    this.name = 'ProjectionReadRefusedError';
  }
}

/**
 * OMN-24616 AC5: a 200 response that is neither a projection envelope (`rows` an array) nor a plain array of rows
 * (file fixtures). The page shows this reason instead of reading the body as an empty, successful read.
 */
export class ProjectionReadMalformedError extends Error {
  constructor(readonly topic: string, readonly detail: string) {
    super(`Projection ${topic} answered with a malformed body: ${detail}`);
    this.name = 'ProjectionReadMalformedError';
  }
}

function describeBody(body: unknown): string {
  if (body === null) return 'null';
  if (Array.isArray(body)) return 'an array';
  if (typeof body !== 'object') return `a ${typeof body}`;
  if ('rows' in body) return `rows is ${Array.isArray((body as { rows: unknown }).rows) ? 'an array' : typeof (body as { rows: unknown }).rows}`;
  const error = (body as { error?: unknown }).error;
  return typeof error === 'string' ? `no rows (error: ${error})` : 'no rows';
}

/** The rows of a served body: an envelope's rows or a plain array; anything else is refused. */
function rowsOf(topic: string, body: unknown): { rows: unknown[]; envelope: ProjectionEnvelope | null } {
  if (isProjectionEnvelope(body)) return { rows: body.rows, envelope: body };
  if (Array.isArray(body)) return { rows: body, envelope: null };
  throw new ProjectionReadMalformedError(topic, describeBody(body));
}

async function refusalOf(topic: string, res: Response): Promise<ProjectionReadRefusedError> {
  let code: string | null = null;
  try {
    const body: unknown = await res.json();
    if (typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string') {
      code = (body as { error: string }).error;
    }
  } catch {
    // A body that is not JSON names no refusal; the status still does.
  }
  return new ProjectionReadRefusedError(topic, res.status, res.statusText, code);
}

interface ProjectionEnvelope {
  rows: unknown[];
  row_count?: unknown;
  data_freshness?: unknown;
  latest_event_at?: unknown;
  truncated?: unknown;
  next_cursor?: unknown;
}

function isProjectionEnvelope(v: unknown): v is ProjectionEnvelope {
  return typeof v === 'object' && v !== null && 'rows' in v && Array.isArray((v as ProjectionEnvelope).rows);
}

export class HttpSnapshotSource implements ProtocolSnapshotSource {
  constructor(private readonly options: HttpSnapshotSourceOptions) {}

  async readSnapshot(
    topic: string,
    params: Readonly<Record<string, string>> = {},
  ): Promise<ProjectionSnapshot> {
    const res = await authedFetch(await this.projectionUrl(topic, params));
    if (!res.ok) throw await refusalOf(topic, res);
    const read = rowsOf(topic, await res.json());
    const readAt = new Date().toISOString();
    if (read.envelope === null) {
      return {
        rows: read.rows,
        rowCount: read.rows.length,
        dataFreshness: 'unknown',
        latestEventAt: null,
        readAt,
      };
    }
    const body = read.envelope;
    const freshness = body.data_freshness;
    const dataFreshness: ProjectionDataFreshness =
      freshness === 'fresh' || freshness === 'idle' || freshness === 'stale' || freshness === 'degraded'
        ? freshness
        : 'unknown';
    return {
      rows: body.rows,
      rowCount: typeof body.row_count === 'number' ? body.row_count : body.rows.length,
      dataFreshness,
      latestEventAt: typeof body.latest_event_at === 'string' ? body.latest_event_at : null,
      readAt,
      ...(body.truncated === true ? { truncated: true } : {}),
      ...(typeof body.next_cursor === 'string' ? { nextCursor: body.next_cursor } : {}),
    };
  }

  /**
   * The exposure URL, carrying the configured tenant when the catalogue says the
   * exposure is tenant-scoped. Both read paths use it, so a scoped exposure is
   * never requested without its tenant (the server answers 422 when it is).
   */
  private async projectionUrl(
    topic: string,
    params: Readonly<Record<string, string>> = {},
  ): Promise<string> {
    const tenant = await resolveTenantFor(topic);
    if (tenant.kind === 'refused') {
      throw new TenantNotConfiguredError(topic, tenant.reason);
    }
    const search = new URLSearchParams(params);
    if (tenant.kind === 'scoped') {
      const tenantValue = new URLSearchParams(tenant.query).get('tenant');
      if (tenantValue !== null) search.set('tenant', tenantValue);
    }
    const suffix = search.size > 0 ? `?${search.toString()}` : '';
    return `${this.options.baseUrl}/projection/${encodeURIComponent(topic)}${suffix}`;
  }

  async *readAll(topic: string): AsyncIterable<unknown> {
    // OMN-14152: bounded fetch — a stalled connection must reject (and let
    // the caller's error state render) rather than hang this generator
    // forever. See fetch-with-timeout.ts.
    const res = await authedFetch(await this.projectionUrl(topic));
    if (!res.ok) throw await refusalOf(topic, res);
    // Projection API returns { rows: [...], ...envelope } — unwrap if present.
    // Plain array responses (file-based fixtures, legacy) are yielded directly; anything else is refused (OMN-24616).
    const items: unknown[] = rowsOf(topic, await res.json()).rows;
    for (const i of items) yield i;
  }
}
