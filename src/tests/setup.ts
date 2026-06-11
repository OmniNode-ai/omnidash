import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// OMN-12969: the global WebSocket stub and VITE_WS_URL env stub were removed.
// The dashboard no longer opens any browser WebSocket — the dead `/ws`
// invalidation/live-tail path was deleted in favour of poll-only projection
// reads — so no test needs a global WebSocket shim. Reintroduction is guarded
// by the local/no-projection-websocket ESLint rule.

// LLM config requires model names in production. Stub them in tests so
// the agent system can be exercised without real LLM env configuration.
vi.stubEnv('VITE_LLM_MODEL', 'test-model');
vi.stubEnv('VITE_LLM_FALLBACK_MODEL', 'test-fallback-model');
