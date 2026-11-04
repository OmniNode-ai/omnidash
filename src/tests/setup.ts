import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// OMN-22168: every test sees the real design tokens, light and dark, the way the app loads them first. A colour a
// component resolves (a chart series, a scene colour) is then the token's value, never a test-only fallback.
if (typeof document !== 'undefined' && !document.head.querySelector('style[data-ds-tokens]')) {
  const tokens = document.createElement('style');
  tokens.setAttribute('data-ds-tokens', '');
  tokens.textContent = readFileSync(resolve(__dirname, '../theme/design-system/tokens.css'), 'utf8');
  document.head.appendChild(tokens);
}

// OMN-12969: the global WebSocket stub and VITE_WS_URL env stub were removed.
// The dashboard no longer opens any browser WebSocket — the dead `/ws`
// invalidation/live-tail path was deleted in favour of poll-only projection
// reads — so no test needs a global WebSocket shim. Reintroduction is guarded
// by the local/no-projection-websocket ESLint rule.

// LLM config requires model names in production. Stub them in tests so
// the agent system can be exercised without real LLM env configuration.
vi.stubEnv('VITE_LLM_MODEL', 'test-model');
vi.stubEnv('VITE_LLM_FALLBACK_MODEL', 'test-fallback-model');
