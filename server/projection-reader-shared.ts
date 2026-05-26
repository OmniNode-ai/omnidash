type Row = Record<string, unknown>;

export function timestampValue(value: unknown): number {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const numeric = Number(raw);
  if (!Number.isNaN(numeric)) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function mergeDelegationSessions(
  savingsRows: Row[],
  eventRows: Row[],
  sessionKeyFn: (row: Row, index: number, kind: 'savings' | 'events') => string,
): Row[] {
  const merged = new Map<string, Row>();
  savingsRows.forEach((row, index) => {
    merged.set(sessionKeyFn(row, index, 'savings'), row);
  });

  eventRows.forEach((eventRow, index) => {
    const key = sessionKeyFn(eventRow, index, 'events');
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, eventRow);
      return;
    }

    merged.set(key, {
      ...existing,
      prompt_tokens: eventRow.prompt_tokens ?? existing.prompt_tokens,
      completion_tokens: eventRow.completion_tokens ?? existing.completion_tokens,
      tokens_to_compliance: eventRow.tokens_to_compliance ?? existing.tokens_to_compliance,
      latency_ms: eventRow.latency_ms ?? existing.latency_ms,
      prompt_text: eventRow.prompt_text ?? existing.prompt_text,
      response_text: eventRow.response_text ?? existing.response_text,
      created_at:
        timestampValue(eventRow.created_at) > timestampValue(existing.created_at)
          ? eventRow.created_at
          : existing.created_at,
    });
  });

  return [...merged.values()];
}

export function buildCostSavingsOverviewResult(
  measuredSessions: Row[],
  omittedTelemetryRows: number,
  recentRuns?: Row[],
): Row {
  const sessionTokens = (session: Row): number =>
    Number(session.prompt_tokens ?? 0) + Number(session.completion_tokens ?? 0);

  const grouped = new Map<string, {
    model_id: string;
    display_name: string;
    execution_mode: string;
    task_count: number;
    tokens_total: number;
    cost_usd: number;
    baseline_cost_usd: number;
    savings_usd: number;
    evidence_ref: string | null;
  }>();

  for (const session of measuredSessions) {
    const displayName = String(session.model_name ?? session.task_type ?? 'delegated-runtime');
    const modelId = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'delegated-runtime';
    const tokens = sessionTokens(session);
    const cost = Number(session.local_cost_usd ?? 0);
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
    existing.cost_usd += cost;
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
  const complianceTokensTotal = measuredSessions.reduce(
    (sum, row) => row.tokens_to_compliance != null
      ? sum + Number(row.tokens_to_compliance)
      : sum,
    0,
  );
  const warnings = omittedTelemetryRows > 0
    ? [`Omitted ${omittedTelemetryRows} delegation row${omittedTelemetryRows === 1 ? '' : 's'} without token telemetry.`]
    : [];

  const result: Row = {
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
    warnings,
    provisioned: measuredSessions.length > 0,
  };

  if (recentRuns !== undefined) {
    result.recent_runs = recentRuns;
    result.measured_run_count = measuredSessions.length;
    result.zero_token_run_count = omittedTelemetryRows;
  }

  return result;
}
