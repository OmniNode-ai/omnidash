/**
 * CI Assertion: Event Registration Coverage Test (OMN-2910)
 *
 * Asserts that every topic in READ_MODEL_TOPICS has a corresponding `case`
 * branch in the ReadModelConsumer.handleMessage() switch statement.
 *
 * Root cause this prevents:
 *   When a new topic is added to READ_MODEL_TOPICS (subscribed) but no
 *   matching `case` is added to handleMessage(), messages arrive silently on
 *   the `default:` branch and are discarded with a console.warn. Dashboard
 *   pages show empty state with no error — invisible drift.
 *
 * Approach:
 *   1. Import READ_MODEL_TOPICS at runtime (resolves all constant references
 *      to their actual string values).
 *   2. Parse handleMessage() source via static analysis to extract case labels
 *      (both string literals and identifier names).
 *   3. Resolve identifier names → string values by importing shared/topics.ts
 *      and server/read-model-consumer.ts exports.
 *   4. Assert: for each topic string in READ_MODEL_TOPICS, that resolved topic
 *      string appears in the set of case-label values.
 *
 * This is intentionally a static-analysis test (not an execution test) so it
 * runs without a Kafka or DB connection in CI.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as sharedTopics from '@shared/topics';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract case label tokens from the handleMessage() switch statement in the
 * given source file. Returns an array of raw tokens — either identifier names
 * (e.g. "SUFFIX_OMNICLAUDE_GATE_DECISION") or string literals with quotes
 * stripped (e.g. "onex.evt.omniclaude.pattern-enforcement.v1").
 *
 * The extraction is scoped to the handleMessage() function body to avoid
 * picking up unrelated switch statements elsewhere in the file.
 */
function extractHandleMessageCaseTokens(filePath: string): string[] {
  const source = fs.readFileSync(filePath, 'utf8');

  // Find the handleMessage function body. We look for the function signature
  // and then extract everything up to the closing brace of its switch.
  const fnStart = source.indexOf('private async handleMessage(');
  if (fnStart === -1) {
    throw new Error('handleMessage() not found in ' + filePath);
  }

  // Slice from the function start to a reasonable end (10,000 chars covers it).
  const fnSlice = source.slice(fnStart, fnStart + 10_000);

  // Extract case labels: both quoted strings and identifiers.
  // Pattern: `case <TOKEN>:` where TOKEN is either:
  //   - A single-quoted string:  'onex.evt.omniclaude.pattern-enforcement.v1'
  //   - A double-quoted string:  "onex.evt...."
  //   - An identifier:           SUFFIX_OMNICLAUDE_GATE_DECISION
  const casePattern = /\bcase\s+(?:'([^']+)'|"([^"]+)"|([A-Z][A-Z0-9_]+))\s*:/g;

  const tokens: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = casePattern.exec(fnSlice)) !== null) {
    // match[1]: single-quoted string value
    // match[2]: double-quoted string value
    // match[3]: identifier name
    const token = match[1] ?? match[2] ?? match[3];
    if (token) tokens.push(token);
  }

  return tokens;
}

/**
 * Build a map of exported string constants from shared/topics.ts plus
 * exported READ_MODEL_TOPICS entries from read-model-consumer.ts.
 *
 * This lets us resolve identifier names like SUFFIX_OMNICLAUDE_GATE_DECISION
 * to their actual string values (e.g. "onex.evt.omniclaude.gate-decision.v1").
 */
function buildConstantResolver(): Map<string, string> {
  const resolver = new Map<string, string>();

  // Resolve all string-valued exports from shared/topics.ts
  for (const [key, value] of Object.entries(sharedTopics)) {
    if (typeof value === 'string') {
      resolver.set(key, value);
    }
  }

  return resolver;
}

/**
 * Given a list of raw case tokens and a constant resolver map, return the set
 * of resolved topic string values that handleMessage() handles.
 */
function resolveCaseTokens(tokens: string[], resolver: Map<string, string>): Set<string> {
  const resolved = new Set<string>();
  for (const token of tokens) {
    if (resolver.has(token)) {
      // Identifier constant → resolve to its string value
      resolved.add(resolver.get(token)!);
    } else {
      // Already a string literal (stripped of quotes by the regex)
      resolved.add(token);
    }
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

// Path to the consumer source file (resolved relative to this test file).
const CONSUMER_PATH = path.resolve(__dirname, '../server/read-model-consumer.ts');

describe('OMN-2910: READ_MODEL_TOPICS → handleMessage() case coverage', () => {
  it('every topic in READ_MODEL_TOPICS has a corresponding case in handleMessage()', async () => {
    // Import READ_MODEL_TOPICS at runtime — resolves all constant references
    // to actual topic strings (e.g. SUFFIX_OMNICLAUDE_GATE_DECISION resolves
    // to "onex.evt.omniclaude.gate-decision.v1").
    const { READ_MODEL_TOPICS } = await import('../server/read-model-consumer');

    // Extract case tokens from handleMessage() source and resolve them.
    const rawTokens = extractHandleMessageCaseTokens(CONSUMER_PATH);
    const resolver = buildConstantResolver();
    const handledTopics = resolveCaseTokens(rawTokens, resolver);

    // Assert: every subscribed topic has a handler case.
    const missingHandlers: string[] = [];
    for (const topic of READ_MODEL_TOPICS) {
      if (!handledTopics.has(topic)) {
        missingHandlers.push(topic);
      }
    }

    if (missingHandlers.length > 0) {
      throw new Error(
        `The following topics appear in READ_MODEL_TOPICS but have no ` +
          `corresponding case in handleMessage():\n` +
          missingHandlers.map((t) => `  - ${t}`).join('\n') +
          `\n\nAdd a case branch for each topic in the handleMessage() ` +
          `switch statement in server/read-model-consumer.ts.`
      );
    }

    // Sanity check: we extracted at least as many cases as READ_MODEL_TOPICS.
    // If this fails, the static analysis regex may be broken.
    expect(handledTopics.size).toBeGreaterThanOrEqual(READ_MODEL_TOPICS.length);
  });

  it('handleMessage() has no case branches for topics not in READ_MODEL_TOPICS (no orphaned cases)', async () => {
    // This is the inverse check: every case in handleMessage() should correspond
    // to a topic that omnidash is actually subscribed to.
    // Note: This catches cases where a topic was removed from READ_MODEL_TOPICS
    // but the case was left behind (dead code).
    const { READ_MODEL_TOPICS } = await import('../server/read-model-consumer');
    const subscribedSet = new Set<string>(READ_MODEL_TOPICS as readonly string[]);

    const rawTokens = extractHandleMessageCaseTokens(CONSUMER_PATH);
    const resolver = buildConstantResolver();
    const handledTopics = resolveCaseTokens(rawTokens, resolver);

    const orphanedCases: string[] = [];
    for (const handledTopic of handledTopics) {
      if (!subscribedSet.has(handledTopic)) {
        orphanedCases.push(handledTopic);
      }
    }

    // Report which cases are orphaned in the failure message.
    const orphanedMsg =
      orphanedCases.length > 0
        ? `Orphaned handleMessage() cases not in READ_MODEL_TOPICS: ${orphanedCases.join(', ')}. ` +
          `Either add them to READ_MODEL_TOPICS or remove the dead case branch.`
        : '';
    expect(orphanedMsg).toBe('');
  });
});
