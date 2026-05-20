import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// getWebSocketUrl() requires at least one URL env var. Stub VITE_WS_URL
// globally so tests that render Providers (which mounts useWebSocketInvalidation)
// don't throw. Individual tests can override with vi.stubEnv as needed.
vi.stubEnv('VITE_WS_URL', 'ws://localhost:3002/ws');

class TestWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readonly url: string;
  readyState = TestWebSocket.OPEN;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = TestWebSocket.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
  }
}

vi.stubGlobal('WebSocket', TestWebSocket);

// LLM config requires model names in production. Stub them in tests so
// the agent system can be exercised without real LLM env configuration.
vi.stubEnv('VITE_LLM_MODEL', 'test-model');
vi.stubEnv('VITE_LLM_FALLBACK_MODEL', 'test-fallback-model');
