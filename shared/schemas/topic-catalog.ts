import { z } from 'zod';

/**
 * Schemas for the ONEX Topic Catalog protocol (OMN-2315).
 *
 * Three message types participate in the bootstrap flow:
 *
 *  1. TopicCatalogQuery   — outgoing command sent by the dashboard on startup.
 *  2. TopicCatalogResponse — incoming event returned by the catalog service.
 *  3. TopicCatalogChanged  — incoming event emitted when the catalog changes.
 *
 * Topic names:
 *   cmd  onex.cmd.platform.topic-catalog-query.v1
 *   evt  onex.evt.platform.topic-catalog-response.v1
 *   evt  onex.evt.platform.topic-catalog-changed.v1
 */

// ---------------------------------------------------------------------------
// ModelTopicCatalogQuery (outgoing command)
// ---------------------------------------------------------------------------

/**
 * Query sent to the catalog service on startup.
 *
 * - `client_id`:      Identifies the requester for observability (not used for routing).
 * - `correlation_id`: UUID that must be echoed back in the response.
 *                     Used to filter responses so multiple dashboard instances
 *                     do not receive each other's catalog responses.
 */
export const TopicCatalogQuerySchema = z.object({
  client_id: z.string().min(1),
  correlation_id: z.string().uuid(),
});
export type TopicCatalogQuery = z.infer<typeof TopicCatalogQuerySchema>;

// ---------------------------------------------------------------------------
// TopicEntry — a single topic record inside a catalog response
// ---------------------------------------------------------------------------

export const TopicEntrySchema = z.object({
  topic_name: z.string().min(1),
});
export type TopicEntry = z.infer<typeof TopicEntrySchema>;

// ---------------------------------------------------------------------------
// ModelTopicCatalogResponse (incoming event)
// ---------------------------------------------------------------------------

/**
 * Catalog response received from the platform catalog service.
 *
 * - `correlation_id`: Must match the query that triggered this response.
 *                     Responses whose `correlation_id` does not match the
 *                     outstanding query are discarded (cross-talk prevention).
 * - `topics`:         Complete list of topics the dashboard should subscribe to.
 * - `warnings`:       Non-fatal advisory messages (e.g. deprecated topic names).
 *                     Surface in the UI when non-empty.
 */
export const TopicCatalogResponseSchema = z.object({
  correlation_id: z.string().uuid(),
  topics: z.array(TopicEntrySchema),
  warnings: z.array(z.string()).default([]),
});
export type TopicCatalogResponse = z.infer<typeof TopicCatalogResponseSchema>;

// ---------------------------------------------------------------------------
// ModelTopicCatalogChanged (incoming event)
// ---------------------------------------------------------------------------

/**
 * Delta event emitted when the topic catalog changes after initial bootstrap.
 *
 * - `topics_added`:   New topics that should be added to active subscriptions.
 * - `topics_removed`: Topics that should be unsubscribed.
 */
export const TopicCatalogChangedSchema = z.object({
  topics_added: z.array(z.string()).default([]),
  topics_removed: z.array(z.string()).default([]),
});
export type TopicCatalogChanged = z.infer<typeof TopicCatalogChangedSchema>;
