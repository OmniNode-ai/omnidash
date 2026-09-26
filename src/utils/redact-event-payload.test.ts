import { describe, expect, it } from 'vitest';
import {
  formatRedactedEventPayload,
  redactEventPayload,
  REDACTED_VALUE,
} from './redact-event-payload';

describe('redactEventPayload', () => {
  it('keeps numeric and boolean counts under token-like keys', () => {
    const output = redactEventPayload({
      tokens_input: 166,
      tokens_output: 6,
      token: 'sk-live-value',
      has_credentials: true,
    });
    expect(output).toEqual({
      tokens_input: 166,
      tokens_output: 6,
      token: REDACTED_VALUE,
      has_credentials: true,
    });
  });

  it('redacts sensitive keys recursively without mutating the input', () => {
    const input = {
      safe: 'visible',
      api_key: 'abc',
      nested: { Authorization: 'Basic abc', password: 'pw' },
      list: [{ privateKey: 'pem' }, { cookieJar: 'session' }],
    };
    const output = redactEventPayload(input);

    expect(output).toEqual({
      safe: 'visible',
      api_key: REDACTED_VALUE,
      nested: { Authorization: REDACTED_VALUE, password: REDACTED_VALUE },
      list: [{ privateKey: REDACTED_VALUE }, { cookieJar: REDACTED_VALUE }],
    });
    expect(input.api_key).toBe('abc');
  });

  it.each([
    'Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature',
    'postgresql://operator:super-secret@db.internal/omni',
  ])('redacts credential-shaped string value %s', (value) => {
    expect(redactEventPayload(value)).toBe(REDACTED_VALUE);
  });

  it('parses and redacts JSON-serialized payloads for display', () => {
    expect(formatRedactedEventPayload('{"token":"abc","ok":true}')).toBe(
      '{\n  "token": "[redacted]",\n  "ok": true\n}',
    );
  });

  it('redacts sensitive key assignments embedded in a summary string', () => {
    expect(redactEventPayload('ready token=secret-value')).toBe('ready token=[redacted]');
  });
});
