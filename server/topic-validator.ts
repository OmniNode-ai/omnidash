/**
 * ONEX Topic Format Validator — TypeScript gate for omnidash.
 *
 * Validates Kafka topic names against the canonical ONEX 5-segment format:
 *   onex.<kind>.<producer>.<event-name>.v<N>
 *
 * This is the TypeScript counterpart of the Python gate in omnibase_infra
 * (util_onex_topic_format.py). Both gates use identical regex patterns, mode
 * names (warn/reject/off), and default mode (warn).
 *
 * @see omnibase_infra/src/omnibase_infra/utils/util_onex_topic_format.py
 */

/** Regex for the canonical ONEX 5-segment topic format. */
const RE_ONEX_TOPIC = /^onex\.(evt|cmd|intent|dlq)\.[a-z0-9-]+\.[a-z0-9._-]+\.v[1-9]\d*$/;

/** Regex for legacy DLQ topics: <prefix>.dlq.<name>.v<N> */
const RE_LEGACY_DLQ = /^[a-z][a-z0-9-]*\.dlq\.[a-z0-9-]+\.v[1-9]\d*$/;

const KAFKA_INTERNAL_PREFIX = '__';

/** Outcome of validating a topic name. */
export type TopicValidationResult = 'valid' | 'valid_legacy_dlq' | 'invalid' | 'skipped_internal';

/** Enforcement mode — semantically identical to the Python gate. */
export type TopicEnforcementMode = 'warn' | 'reject' | 'off';

/**
 * Validate a topic name against the canonical ONEX format.
 *
 * @returns A tuple of [result, reason]. Reason is empty when valid or skipped.
 */
export function validateOnexTopicFormat(topic: string): [TopicValidationResult, string] {
  if (topic.startsWith(KAFKA_INTERNAL_PREFIX)) {
    return ['skipped_internal', ''];
  }
  if (RE_ONEX_TOPIC.test(topic)) {
    return ['valid', ''];
  }
  if (RE_LEGACY_DLQ.test(topic)) {
    return ['valid_legacy_dlq', 'legacy DLQ format'];
  }
  return [
    'invalid',
    `Topic '${topic}' does not match ONEX format: onex.(evt|cmd|intent|dlq).<producer>.<event-name>.v<N>`,
  ];
}

/**
 * Read the enforcement mode from environment.
 * Defaults to 'warn' if not set or invalid.
 */
export function getEnforcementMode(): TopicEnforcementMode {
  const raw = process.env.ONEX_TOPIC_ENFORCEMENT_MODE?.toLowerCase().trim();
  if (raw === 'reject' || raw === 'off') return raw;
  return 'warn';
}

/**
 * Enforce topic format validation before publishing.
 *
 * In 'warn' mode, logs a warning and allows the publish.
 * In 'reject' mode, throws an error to prevent the publish.
 * In 'off' mode, skips validation entirely.
 *
 * @param topic - The Kafka topic to validate.
 * @param logger - Optional logging function (defaults to console.warn).
 * @throws Error if mode is 'reject' and the topic is invalid.
 */
export function enforceTopicFormat(
  topic: string,
  logger: (msg: string) => void = console.warn
): void {
  const mode = getEnforcementMode();
  if (mode === 'off') return;

  const [result, reason] = validateOnexTopicFormat(topic);
  if (result === 'valid' || result === 'valid_legacy_dlq' || result === 'skipped_internal') {
    return;
  }

  if (mode === 'reject') {
    throw new Error(`[ONEX Topic Gate] Rejected publish to non-conforming topic: ${reason}`);
  }

  // mode === 'warn'
  logger(`[ONEX Topic Gate] Warning: ${reason}`);
}
