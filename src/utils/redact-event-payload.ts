const SENSITIVE_KEY = /secret|token|password|passwd|api[_-]?key|authorization|credential|cookie|private[_-]?key|dsn/i;
const BEARER_TOKEN = /^\s*bearer\s+\S+\s*$/i;
const JWT = /^\s*[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\s*$/;
const URL_WITH_CREDENTIALS = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:]+:[^\s/@]+@/i;
const INLINE_SENSITIVE_ASSIGNMENT = /(secret|token|password|passwd|api[_-]?key|authorization|credential|cookie|private[_-]?key|dsn)(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi;

export const REDACTED_VALUE = '[redacted]';

function shouldRedactString(value: string): boolean {
  return BEARER_TOKEN.test(value) || JWT.test(value) || URL_WITH_CREDENTIALS.test(value);
}

/** Return a deep redacted copy without mutating the projection row payload. */
export function redactEventPayload(value: unknown, key?: string): unknown {
  // A number or boolean under a sensitive-looking key is a count or a flag
  // (tokens_input, token_count, has_credentials), never a secret value, and
  // hiding it would blank the delegation token columns the operator reads.
  if (
    key !== undefined &&
    SENSITIVE_KEY.test(key) &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    return REDACTED_VALUE;
  }
  if (typeof value === 'string') {
    if (shouldRedactString(value)) return REDACTED_VALUE;
    return value.replace(
      INLINE_SENSITIVE_ASSIGNMENT,
      (_match, keyName: string, separator: string) => `${keyName}${separator}${REDACTED_VALUE}`,
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactEventPayload(item));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        redactEventPayload(entryValue, entryKey),
      ]),
    );
  }
  return value;
}

export function formatRedactedEventPayload(payload: unknown): string {
  if (typeof payload === 'string') {
    try {
      return JSON.stringify(redactEventPayload(JSON.parse(payload)), null, 2);
    } catch {
      return String(redactEventPayload(payload));
    }
  }
  return JSON.stringify(redactEventPayload(payload), null, 2);
}
