import type { LLMConfig } from '@page-agent/llms';

export type { LLMConfig };

// vLLM and most self-hosted inference servers require an apiKey field in the
// OpenAI-compatible API but do not authenticate it. This sentinel satisfies
// the type without implying a real credential. Set VITE_LLM_API_KEY if your
// server does validate it.
const NO_AUTH_SENTINEL = 'not-needed';

const LLM_HOST = import.meta.env.VITE_LLM_BASE_URL;
const LLM_FALLBACK_HOST = import.meta.env.VITE_LLM_FALLBACK_URL;

// In dev, route through the Vite proxy at /llm-proxy/v1 so VITE_LLM_BASE_URL
// is only required when actually hitting the LLM in production. The proxy
// target is read from the same env var inside vite.config.ts.
function buildBaseURL(host: string | undefined): string {
  if (import.meta.env.DEV) return '/llm-proxy/v1';
  if (!host) {
    throw new Error(
      'VITE_LLM_BASE_URL is required for production builds. ' +
        'See .env.example for the expected format.',
    );
  }
  return `${host}/v1`;
}

// Lazy-throw getters for model names: callers that never read the model
// (e.g. dev mode using the proxy) don't trip this. Anyone using the config
// object without VITE_LLM_MODEL set gets a clear error at access time.
export const DEFAULT_LLM_CONFIG: LLMConfig = {
  baseURL: buildBaseURL(LLM_HOST),
  get model(): string {
    const m = import.meta.env.VITE_LLM_MODEL;
    if (!m) {
      throw new Error(
        'VITE_LLM_MODEL is required. Set it to the model ID served by your LLM backend. ' +
          'See .env.example for examples.',
      );
    }
    return m;
  },
  apiKey: import.meta.env.VITE_LLM_API_KEY ?? NO_AUTH_SENTINEL,
  temperature: 0.1,
};

export const FALLBACK_LLM_CONFIG: LLMConfig = {
  // Lazy-throw via getter: callers that don't opt into the fallback path
  // never trip this, but anyone wiring useFallback=true without setting
  // VITE_LLM_FALLBACK_URL gets a clear error instead of a silent connect
  // to a stale literal.
  get baseURL(): string {
    if (!LLM_FALLBACK_HOST) {
      throw new Error(
        'VITE_LLM_FALLBACK_URL is required when useFallback=true. ' +
          'Either set it or stop opting into the fallback path.',
      );
    }
    return `${LLM_FALLBACK_HOST}/v1`;
  },
  get model(): string {
    const m = import.meta.env.VITE_LLM_FALLBACK_MODEL;
    if (!m) {
      throw new Error(
        'VITE_LLM_FALLBACK_MODEL is required when useFallback=true. ' +
          'Set it to the model ID served by your fallback LLM backend.',
      );
    }
    return m;
  },
  apiKey: import.meta.env.VITE_LLM_FALLBACK_API_KEY ?? NO_AUTH_SENTINEL,
  temperature: 0.1,
};
