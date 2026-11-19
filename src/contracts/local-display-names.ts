/**
 * OMN-24616 AC4: the one declared source of display names for served keys the local pages show.
 *
 * The pages keep no provider or tier list of their own. GET /models and the served rows name each provider and tier;
 * this module only says how a known key reads, the order known providers are listed in, and a provider whose setup
 * is not `onex models add <name>`. A key not declared here renders by its served name, unchanged, so a provider or
 * tier the dashboard has never seen still shows as the backend names it.
 */

/** How a known provider id reads (OMN-20816). */
export const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  gemini: 'Gemini', openrouter: 'OpenRouter', openai: 'OpenAI', ollama: 'Ollama',
};

/** Known providers first, in this order, then every other served provider in the served order (OMN-21970 AC10). */
export const PROVIDER_ORDER: readonly string[] = ['gemini', 'openrouter', 'openai', 'ollama'];

/** A provider set up some other way than `onex models add <name>` (OMN-20816 R3). */
export const PROVIDER_SETUP_NOTES: Readonly<Record<string, string>> = {
  ollama: 'Set up by onboarding (run it again with --provider ollama)',
};

/** How a known routing tier reads; any other tier reads as its served key in sentence case (OMN-21166). */
export const TIER_LABELS: Readonly<Record<string, string>> = {
  local: 'Local', cheap_cloud: 'Cheap cloud', cheap_frontier: 'Cheap frontier', claude: 'Claude', cloud: 'Cloud',
  not_tier_routed: 'Not tier-routed',
};
