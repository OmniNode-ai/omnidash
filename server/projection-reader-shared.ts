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
