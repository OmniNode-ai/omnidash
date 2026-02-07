/**
 * @deprecated Moved to shared/topics.ts — the single source of truth for all topic constants.
 * This file is retained only as a redirect. Import from '@shared/topics' instead.
 */
export {
  SUFFIX_INTELLIGENCE_INTENT_CLASSIFIED as ONEX_EVT_OMNIINTELLIGENCE_INTENT_CLASSIFIED_V1,
  SUFFIX_MEMORY_INTENT_STORED as ONEX_EVT_OMNIMEMORY_INTENT_STORED_V1,
  SUFFIX_MEMORY_INTENT_QUERY_RESPONSE as ONEX_EVT_OMNIMEMORY_INTENT_QUERY_RESPONSE_V1,
  resolveTopicName as withEnvPrefix,
  getTopicEnvPrefix,
} from '@shared/topics';
