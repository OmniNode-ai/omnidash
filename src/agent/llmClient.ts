import type { LLMConfig } from '@page-agent/llms';

export type { LLMConfig };

// VITE_LLM_BASE_URL holds the host only (no /v1 suffix); /v1 is appended here.
// In dev mode, use '/llm-proxy/v1' to route through the Vite proxy and avoid CORS.
const LLM_HOST = import.meta.env.VITE_LLM_BASE_URL || 'http://192.168.86.201:8000';

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  baseURL: import.meta.env.DEV ? '/llm-proxy/v1' : `${LLM_HOST}/v1`,
  model: import.meta.env.VITE_LLM_MODEL || 'qwen3-coder-30b-awq',
  apiKey: import.meta.env.VITE_LLM_API_KEY || 'not-needed',
  temperature: 0.1,
};

export const FALLBACK_LLM_CONFIG: LLMConfig = {
  baseURL: 'http://192.168.86.201:8001/v1',
  model: 'deepseek-r1-14b-awq',
  apiKey: 'not-needed',
  temperature: 0.1,
};
