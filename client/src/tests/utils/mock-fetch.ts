/**
 * Utility functions for mocking fetch in tests
 */

import { vi } from 'vitest';

export interface MockResponseOptions {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  delay?: number;
}

/**
 * Create a mock fetch response
 * Returns a Response object with JSON body that can be read multiple times
 */
export function createMockResponse<T>(data: T, options: MockResponseOptions = {}): Response {
  const {
    status = 200,
    statusText = 'OK',
    headers = { 'Content-Type': 'application/json' },
  } = options;

  // Store body as string so it can be read multiple times
  const bodyText = JSON.stringify(data);

  // Create headers object
  const headerObj = new Headers();
  Object.entries(headers).forEach(([key, value]) => {
    headerObj.set(key, value);
  });

  return new Response(bodyText, {
    status,
    statusText,
    headers: headerObj,
  });
}

/**
 * Create a mock fetch that returns an error
 */
export function createMockFetchError(): Response {
  return new Response(null, {
    status: 500,
    statusText: 'Internal Server Error',
  });
}

/**
 * Setup global fetch mock with a response map
 * Accepts Response objects, Error objects, or plain objects (serialized as JSON)
 */
export function setupFetchMock(responses: Map<string, Response | Error | unknown>): void {
  // Cache body texts to avoid reading Response bodies multiple times
  const bodyTextCache = new Map<Response, string>();

  async function getBodyText(response: Response): Promise<string> {
    if (!bodyTextCache.has(response)) {
      // Clone the response before reading to avoid "Body is unusable" errors
      const cloned = response.clone();
      const text = await cloned.text();
      bodyTextCache.set(response, text);
      return text;
    }
    return bodyTextCache.get(response)!;
  }

  global.fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // Find matching response
    for (const [pattern, response] of Array.from(responses.entries())) {
      if (url.includes(pattern)) {
        if (response instanceof Error) {
          throw response;
        }
        // Handle plain objects that aren't Response instances
        if (!(response instanceof Response)) {
          // If it's a plain object with ok/status, create a proper Response
          if (
            typeof response === 'object' &&
            response !== null &&
            'ok' in response &&
            'status' in response
          ) {
            const status = (response as any).status || 500;
            const statusText = (response as any).statusText || 'Internal Server Error';
            return new Response(null, { status, statusText });
          }
          // Otherwise, try to serialize it as JSON
          return new Response(JSON.stringify(response), {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/json' },
          });
        }
        // Get body text (cached) and create new Response each time to allow multiple reads
        const bodyText = await getBodyText(response);

        return new Response(bodyText, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
    }

    // Default: 404 not found
    return new Response(null, { status: 404, statusText: 'Not Found' });
  }) as typeof fetch;
}

/**
 * Reset fetch mock to original fetch
 */
export function resetFetchMock(): void {
  // @ts-ignore - global fetch in test environment
  if (typeof globalThis !== 'undefined' && globalThis.fetch) {
    // Keep original fetch if available
    global.fetch = globalThis.fetch;
  } else {
    // Fallback: create a basic fetch mock
    global.fetch = async () => {
      return new Response(null, { status: 404, statusText: 'Not Found' });
    };
  }
}
