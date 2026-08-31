/**
 * Shared utilities for projection readers.
 *
 * Both SqliteProjectionReader and PostgresProjectionReader share identical
 * session-merge logic and timestamp parsing. Extracted here per OMN-11614
 * to eliminate the duplication flagged in the TODO on postgres-projection-reader.ts.
 */

export type Row = Record<string, unknown>;

// ── Timestamp ────────────────────────────────────────────────────────────────

/**
 * Parse an arbitrary timestamp value (ISO string, unix-seconds, unix-ms) to a
 * comparable millisecond number. Returns 0 for unparseable values.
 */
export function timestampValue(value: unknown): number {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const numeric = Number(raw);
  if (!Number.isNaN(numeric)) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

// ── Session-merge helpers ────────────────────────────────────────────────────

/**
 * Build a stable merge key for a delegation session row.
 * Uses session_id when present; falls back to a composite string derived
 * from the row index, timestamp, and model_name.
 */
export function sessionKey(row: Row, index: number, source: string): string {
  const key = String(row.session_id ?? '').trim();
  return key || `${source}-row-${index}-${String(row.created_at ?? '')}-${String(row.model_name ?? '')}`;
}

/**
 * Merge two lists of delegation session rows (savings-estimates rows and live
 * runtime-event rows) by session key, preferring runtime token fields when a
 * session appears in both sources.
 */
export function mergeDelegationSessions(
  savingsRows: Row[],
  eventRows: Row[],
  savingsSource: string,
  eventsSource: string,
): Row[] {
  const merged = new Map<string, Row>();
  savingsRows.forEach((row, index) => {
    merged.set(sessionKey(row, index, savingsSource), row);
  });

  eventRows.forEach((eventRow, index) => {
    const key = sessionKey(eventRow, index, eventsSource);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, eventRow);
      return;
    }

    const existingTs = timestampValue(existing.created_at);
    const eventTs = timestampValue(eventRow.created_at);

    merged.set(key, {
      ...existing,
      prompt_tokens: eventRow.prompt_tokens ?? existing.prompt_tokens,
      completion_tokens: eventRow.completion_tokens ?? existing.completion_tokens,
      tokens_to_compliance: eventRow.tokens_to_compliance ?? existing.tokens_to_compliance,
      latency_ms: eventRow.latency_ms ?? existing.latency_ms,
      prompt_text: eventRow.prompt_text ?? existing.prompt_text,
      response_text: eventRow.response_text ?? existing.response_text,
      created_at: eventTs > existingTs ? eventRow.created_at : existing.created_at,
    });
  });

  return [...merged.values()];
}

// ── Cost-savings overview aggregation ────────────────────────────────────────

interface SessionGroupEntry {
  model_id: string;
  display_name: string;
  execution_mode: string;
  task_count: number;
  tokens_total: number;
  cost_usd: number;
  baseline_cost_usd: number;
  savings_usd: number;
  evidence_ref: string | null;
}

/** Token count for a session row (prompt + completion). */
export function sessionTokens(session: Row): number {
  return Number(session.prompt_tokens ?? 0) + Number(session.completion_tokens ?? 0);
}

/**
 * Aggregate a list of token-backed delegation session rows into the
 * cost-savings-overview projection shape.
 *
 * Returns the full overview projection envelope as a single Row so both
 * readers can return `[buildCostSavingsOverview(...)]` without duplication.
 */
export function buildCostSavingsOverview(sessions: Row[]): Row {
  const tokenBackedSessions = sessions.filter((s) => sessionTokens(s) > 0);
  const omittedTelemetryRows = sessions.length - tokenBackedSessions.length;

  const grouped = new Map<string, SessionGroupEntry>();

  for (const session of tokenBackedSessions) {
    const displayName = String(session.model_name ?? session.task_type ?? 'delegated-runtime');
    const modelId = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'delegated-runtime';
    const tokens = sessionTokens(session);
    const baselineCandidate = Number(session.cloud_cost_usd ?? 0);
    const measuredSavings = Number(session.savings_usd ?? 0);
    const savings = Math.max(measuredSavings, baselineCandidate);
    const baseline = Math.max(baselineCandidate, savings);
    const existing = grouped.get(modelId) ?? {
      model_id: modelId,
      display_name: displayName,
      execution_mode: 'delegated',
      task_count: 0,
      tokens_total: 0,
      cost_usd: 0,
      baseline_cost_usd: 0,
      savings_usd: 0,
      evidence_ref: null,
    };
    existing.task_count += 1;
    existing.tokens_total += tokens;
    // cost_usd stays 0 — local model has negligible tracked cost
    existing.baseline_cost_usd += baseline;
    existing.savings_usd += savings;
    existing.evidence_ref = existing.evidence_ref ?? String(session.session_id ?? '');
    grouped.set(modelId, existing);
  }

  const rows = [...grouped.values()].map((row) => ({
    ...row,
    cost_usd: Number(row.cost_usd.toFixed(6)),
    baseline_cost_usd: Number(row.baseline_cost_usd.toFixed(6)),
    savings_usd: Number(row.savings_usd.toFixed(6)),
    savings_pct: row.baseline_cost_usd > 0
      ? Number((row.savings_usd / row.baseline_cost_usd).toFixed(6))
      : 0,
    runtime_address: null,
    evidence_ref: row.evidence_ref || null,
  })).sort((a, b) => b.savings_usd - a.savings_usd);

  const totalCost = rows.reduce((sum, row) => sum + row.cost_usd, 0);
  const totalBaseline = rows.reduce((sum, row) => sum + row.baseline_cost_usd, 0);
  const totalSavings = rows.reduce((sum, row) => sum + row.savings_usd, 0);
  const tokensTotal = rows.reduce((sum, row) => sum + row.tokens_total, 0);
  const complianceTokensTotal = tokenBackedSessions.reduce(
    (sum, row) => row.tokens_to_compliance != null
      ? sum + Number(row.tokens_to_compliance)
      : sum,
    0,
  );

  const recentRuns = tokenBackedSessions.slice(0, 20).map((session) => {
    const promptTokens = Number(session.prompt_tokens ?? 0);
    const completionTokens = Number(session.completion_tokens ?? 0);
    const totalTokens = promptTokens + completionTokens;
    return {
      session_id: String(session.session_id ?? ''),
      task_type: String(session.task_type ?? ''),
      model_name: String(session.model_name ?? session.task_type ?? 'delegated-runtime'),
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      savings_usd: Number(session.savings_usd ?? 0),
      latency_ms: session.latency_ms == null ? null : Number(session.latency_ms),
      created_at: String(session.created_at ?? ''),
      token_provenance: 'measured',
    };
  });

  const warnings = omittedTelemetryRows > 0
    ? [`Omitted ${omittedTelemetryRows} delegation row${omittedTelemetryRows === 1 ? '' : 's'} without token telemetry.`]
    : [];

  return {
    window: '24h',
    total_cost_usd: Number(totalCost.toFixed(6)),
    total_baseline_cost_usd: Number(totalBaseline.toFixed(6)),
    total_savings_usd: Number(totalSavings.toFixed(6)),
    savings_rate: totalBaseline > 0 ? Number((totalSavings / totalBaseline).toFixed(6)) : 0,
    tokens_total: tokensTotal,
    tokens_to_compliance: complianceTokensTotal > 0 ? complianceTokensTotal : undefined,
    local_token_pct: tokensTotal > 0 ? 1 : 0,
    captured_at: new Date().toISOString(),
    rows,
    recent_runs: recentRuns,
    measured_run_count: tokenBackedSessions.length,
    zero_token_run_count: omittedTelemetryRows,
    warnings,
    provisioned: tokenBackedSessions.length > 0,
  };
}

// -- Log safety (OMN-17188) --------------------------------------------------

/**
 * Neutralize a caller-supplied string before it reaches a log sink.
 *
 * `GET /projection/:topic` puts an attacker-chosen path segment into `topic`,
 * and Express percent-decodes path params -- so `%0A` / `%0D` arrive as real
 * CR/LF bytes. Interpolated straight into a log line, that lets a caller forge
 * additional log entries (CodeQL js/log-injection, alerts #9/#10).
 *
 * Two separate neutralizations, in order:
 *  1. CR/LF -> a single space, so one logged value can never become two lines.
 *  2. Remaining C0/DEL control characters stripped, so terminal escape
 *     sequences cannot rewrite what an operator reads in a log tail.
 *
 * The value is also length-capped: a log sink is not a data channel, and an
 * unbounded topic would let a caller flood it.
 */
export function sanitizeForLog(value: string, maxLength = 200): string {
  const flattened = value
    // The alternation form (not a `[\r\n]` character class) is deliberate: CodeQL's
    // js/log-injection sanitizer is recognized via StringReplaceCall.replaces, which
    // resolves a constant pattern per branch and does NOT see inside a character
    // class. The class form left alerts #14/#15 open on dev even though the runtime
    // behaviour was already correct -- same neutralization, recognized shape.
    .replace(/\n|\r/g, ' ')
    // Matching control characters is the entire purpose of this sanitizer:
    // `no-control-regex` exists to catch them appearing in a pattern by
    // accident, but here the class IS the payload being neutralized, so the
    // rule is inverted and is waived deliberately.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '');
  return flattened.length > maxLength ? `${flattened.slice(0, maxLength)}...` : flattened;
}

/**
 * Render an unknown caught value as a single-line, log-safe string.
 *
 * Errors thrown below this layer can embed caller-supplied text in their
 * message (e.g. a rejected projection topic), so the message is a taint
 * carrier even when the log call's own format string is constant
 * (CodeQL js/log-injection, alert #10). Keep the error name and message; drop
 * the stack, which is multi-line by construction and would defeat the
 * one-value-one-line property this function exists to guarantee.
 */
export function describeError(err: unknown): string {
  if (err instanceof Error) return sanitizeForLog(`${err.name}: ${err.message}`);
  return sanitizeForLog(String(err));
}
