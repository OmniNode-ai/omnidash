/**
 * OMN-18771 — the exposure census read.
 *
 * `GET /projections` is the backend's own catalogue of every exposure it
 * declares. It is the authority for WHICH topics exist; it is deliberately not
 * trusted as the authority for whether a topic ANSWERS.
 *
 * Measured on the .201 dev lane, 2026-09-22: 65 exposures, and every single one
 * reports `status: "ok"`. Only 17 of them are `backing: "bus"`; the other 48
 * are `not_yet_bus_backed`. So `status` alone would paint 65 healthy rows over
 * a surface where 48 refuse to serve from the bus — which is precisely the
 * defect the archived dashboard shipped, where a topic whose consumer had died
 * still drew a healthy edge.
 *
 * The census therefore classifies on `backing`/`bus_backed`, and reports a
 * refusal by its own name rather than as an absence.
 *
 * Reads go through this module rather than a component, per the repo's hard
 * rule that `/api/` path literals live only in `src/services/` or
 * `src/data-source/` and that components own no truth.
 */

import { resolveProjectionBaseUrl } from './projection-base-url';

/** How an exposure answers, as the census renders it. */
export type ExposureReachability =
  /** Declared and served from the bus. */
  | 'reachable'
  /** Declared, and the backend names a reason it will not serve from the bus. */
  | 'refused'
  /** Declared, and the backend said something this census does not model. */
  | 'unknown';

export interface ExposureCensusRow {
  topic: string;
  /** The backend's own `status` field. Recorded, never used to decide health. */
  declaredStatus: string | null;
  /** The backend's own `backing` field — `bus`, `not_yet_bus_backed`, … */
  backing: string | null;
  reachability: ExposureReachability;
  /**
   * Why an exposure is not reachable, in the backend's words where it gives
   * them and in the backing value where it does not. Never synthesised.
   */
  refusal: string | null;
}

interface RawExposure {
  topic?: unknown;
  status?: unknown;
  backing?: unknown;
  bus_backed?: unknown;
  degraded_reason?: unknown;
}

function asStringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Classify one catalogue entry.
 *
 * `bus_backed` and `backing` agree on every row measured so far, but they are
 * separate fields and a disagreement is a real possibility, so this treats the
 * explicit `backing` string as the authority and falls back to the boolean.
 * An entry that carries neither is `unknown` rather than assumed healthy.
 */
export function classifyExposure(raw: RawExposure): ExposureCensusRow | null {
  const topic = asStringOrNull(raw.topic);
  if (topic === null) return null;

  const backing = asStringOrNull(raw.backing);
  const declaredStatus = asStringOrNull(raw.status);
  const degraded = asStringOrNull(raw.degraded_reason);

  let reachability: ExposureReachability;
  let refusal: string | null = null;

  if (backing === 'bus') {
    reachability = 'reachable';
  } else if (backing !== null) {
    reachability = 'refused';
    refusal = degraded ?? backing;
  } else if (raw.bus_backed === true) {
    reachability = 'reachable';
  } else if (raw.bus_backed === false) {
    reachability = 'refused';
    refusal = degraded ?? 'bus_backed is false and no backing was declared';
  } else {
    reachability = 'unknown';
    refusal = degraded ?? 'the catalogue entry declared neither backing nor bus_backed';
  }

  return { topic, declaredStatus, backing, reachability, refusal };
}

export interface ExposureCensus {
  rows: ExposureCensusRow[];
  reachable: number;
  refused: number;
  unknown: number;
}

export function summarise(rows: ExposureCensusRow[]): ExposureCensus {
  return {
    rows,
    reachable: rows.filter((r) => r.reachability === 'reachable').length,
    refused: rows.filter((r) => r.reachability === 'refused').length,
    unknown: rows.filter((r) => r.reachability === 'unknown').length,
  };
}

/**
 * The live census.
 *
 * Throws rather than returning an empty census when the catalogue cannot be
 * read, so the caller can render "could not read" instead of "nothing is
 * declared". Those two are indistinguishable in an empty array and only one of
 * them is good news.
 */
export async function fetchExposureCensus(): Promise<ExposureCensus> {
  const base = resolveProjectionBaseUrl();
  if (base === null) {
    throw new Error('file mode has no projection backend to read the exposure catalogue from');
  }
  const res = await fetch(`${base}/projections`);
  if (!res.ok) throw new Error(`GET /projections returned HTTP ${res.status}`);

  // A same-origin dev server with no projection backend answers this path with
  // the SPA's index.html, and `res.json()` then throws `Unexpected token '<'`,
  // which tells a reader nothing about what is wrong. Observed on the local
  // dev server 2026-09-22. Name the actual condition instead.
  const raw = await res.text();
  if (raw.trimStart().startsWith('<')) {
    throw new Error(
      `GET ${base || '(same origin)'}/projections returned HTML, not JSON — no projection backend is serving this origin. Point the bridge at a lab host, or switch the data source.`,
    );
  }
  let body: { topics?: RawExposure[] };
  try {
    body = JSON.parse(raw) as { topics?: RawExposure[] };
  } catch {
    throw new Error(`GET /projections returned a body that is not JSON (${raw.length} bytes)`);
  }
  const rows: ExposureCensusRow[] = [];
  for (const entry of body.topics ?? []) {
    const row = classifyExposure(entry ?? {});
    if (row !== null) rows.push(row);
  }
  rows.sort((a, b) => a.topic.localeCompare(b.topic));
  return summarise(rows);
}
