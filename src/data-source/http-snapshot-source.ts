import type {
  ProjectionDataFreshness,
  ProjectionSnapshot,
  ProtocolSnapshotSource,
} from './protocol-snapshot-source';
import { authedFetch } from './authed-fetch';
import { resolveTenantFor } from './projection-tenant';

export interface HttpSnapshotSourceOptions { baseUrl: string; }

interface ProjectionEnvelope {
  rows: unknown[];
  row_count?: unknown;
  data_freshness?: unknown;
  latest_event_at?: unknown;
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
    if (!res.ok) {
      throw new Error(
        `Projection ${topic} failed: HTTP ${res.status} ${res.statusText}`.trim(),
      );
    }
    const body: unknown = await res.json();
    const readAt = new Date().toISOString();
    if (!isProjectionEnvelope(body)) {
      const rows = Array.isArray(body) ? body : [];
      return {
        rows,
        rowCount: rows.length,
        dataFreshness: 'unknown',
        latestEventAt: null,
        readAt,
      };
    }
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
    if (tenant.kind === 'refused') throw new Error(tenant.reason);
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
    if (!res.ok) {
      throw new Error(
        `Projection ${topic} failed: HTTP ${res.status} ${res.statusText}`.trim(),
      );
    }
    const body = await res.json();
    // Projection API returns { rows: [...], ...envelope } — unwrap if present.
    // Plain array responses (file-based fixtures, legacy) are yielded directly.
    const items: unknown[] = isProjectionEnvelope(body) ? body.rows : (body as unknown[]);
    for (const i of items) yield i;
  }
}
