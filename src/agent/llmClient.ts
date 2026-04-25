import type { LLMConfig } from '@page-agent/llms';

export type { LLMConfig };

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

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  baseURL: buildBaseURL(LLM_HOST),
  model: import.meta.env.VITE_LLM_MODEL || 'qwen3-coder-30b-awq',
  apiKey: import.meta.env.VITE_LLM_API_KEY || 'not-needed',
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
  model: import.meta.env.VITE_LLM_FALLBACK_MODEL || 'deepseek-r1-14b-awq',
  apiKey: import.meta.env.VITE_LLM_FALLBACK_API_KEY || 'not-needed',
  temperature: 0.1,
};
