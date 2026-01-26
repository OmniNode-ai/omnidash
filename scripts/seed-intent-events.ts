#!/usr/bin/env tsx

/* eslint-disable no-console */

/**
 * Seed Intent Events Script
 *
 * Publishes test intent classification events to Kafka topics for dashboard testing.
 * Run with: npx tsx scripts/seed-intent-events.ts
 *
 * @see OMN-1458 - Real-time Intent Dashboard Panel
 */

import 'dotenv/config';
import { Kafka, Partitioners, Producer } from 'kafkajs';
import { randomUUID } from 'node:crypto';
import {
  INTENT_CLASSIFIED_TOPIC,
  INTENT_STORED_TOPIC,
  EVENT_TYPE_NAMES,
  VALID_INTENT_CATEGORIES,
  type IntentClassifiedEvent,
  type IntentStoredEvent,
  type IntentCategory,
} from '../shared/intent-types';

// ============================================================================
// Configuration
// ============================================================================

const brokers = process.env.KAFKA_BROKERS || process.env.KAFKA_BOOTSTRAP_SERVERS;
if (!brokers) {
  console.error(
    '\x1b[31mError:\x1b[0m KAFKA_BROKERS or KAFKA_BOOTSTRAP_SERVERS environment variable is required.'
  );
  console.error('   Set it in .env file or export it before running this script.');
  console.error('   Example: KAFKA_BROKERS=192.168.86.200:29092');
  process.exit(1);
}

const kafka = new Kafka({
  brokers: brokers.split(','),
  clientId: 'omnidash-intent-seed-script',
});

const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
});

// ============================================================================
// Mock Data Configuration
// ============================================================================

/**
 * Keywords relevant to each intent category
 */
const CATEGORY_KEYWORDS: Record<IntentCategory, string[]> = {
  debugging: [
    'error',
    'bug',
    'fix',
    'stack trace',
    'exception',
    'crash',
    'undefined',
    'null',
    'breakpoint',
  ],
  code_generation: [
    'create',
    'generate',
    'implement',
    'build',
    'new',
    'function',
    'class',
    'component',
    'api',
  ],
  refactoring: [
    'refactor',
    'clean',
    'improve',
    'restructure',
    'rename',
    'extract',
    'simplify',
    'optimize code',
  ],
  testing: [
    'test',
    'unit test',
    'integration',
    'mock',
    'assert',
    'coverage',
    'jest',
    'vitest',
    'spec',
  ],
  documentation: [
    'document',
    'readme',
    'jsdoc',
    'comment',
    'explain',
    'describe',
    'api docs',
    'markdown',
  ],
  analysis: ['analyze', 'review', 'audit', 'inspect', 'evaluate', 'check', 'assess', 'examine'],
  pattern_learning: [
    'pattern',
    'learn',
    'detect',
    'recognize',
    'similar',
    'template',
    'best practice',
  ],
  quality_assessment: [
    'quality',
    'lint',
    'eslint',
    'prettier',
    'code style',
    'standards',
    'metrics',
  ],
  semantic_analysis: ['meaning', 'semantic', 'intent', 'understand', 'parse', 'ast', 'syntax'],
  deployment: [
    'deploy',
    'release',
    'publish',
    'ci/cd',
    'build',
    'docker',
    'kubernetes',
    'production',
  ],
  configuration: [
    'config',
    'setup',
    'environment',
    'env',
    'settings',
    'options',
    'flags',
    'parameters',
  ],
  question: ['what', 'how', 'why', 'when', 'where', 'explain', 'help', 'question', 'understand'],
  unknown: ['misc', 'other', 'general', 'various'],
};

/**
 * Categories with weighted distribution (more common ones have higher weights)
 */
const WEIGHTED_CATEGORIES: Array<{ category: IntentCategory; weight: number }> = [
  { category: 'debugging', weight: 20 },
  { category: 'code_generation', weight: 18 },
  { category: 'documentation', weight: 12 },
  { category: 'refactoring', weight: 10 },
  { category: 'testing', weight: 10 },
  { category: 'question', weight: 8 },
  { category: 'analysis', weight: 6 },
  { category: 'configuration', weight: 5 },
  { category: 'quality_assessment', weight: 4 },
  { category: 'pattern_learning', weight: 3 },
  { category: 'semantic_analysis', weight: 2 },
  { category: 'deployment', weight: 1 },
  { category: 'unknown', weight: 1 },
];

// ============================================================================
// Helper Functions
// ============================================================================

function randomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate a random confidence score between 0.7 and 0.99
 */
function randomConfidence(): number {
  return 0.7 + Math.random() * 0.29;
}

/**
 * Select a category based on weighted distribution
 */
function selectWeightedCategory(): IntentCategory {
  const totalWeight = WEIGHTED_CATEGORIES.reduce((sum, c) => sum + c.weight, 0);
  let random = Math.random() * totalWeight;

  for (const { category, weight } of WEIGHTED_CATEGORIES) {
    random -= weight;
    if (random <= 0) {
      return category;
    }
  }

  return 'unknown';
}

/**
 * Generate random keywords for a category
 */
function generateKeywords(category: IntentCategory, count: number = 3): string[] {
  const categoryKeywords = CATEGORY_KEYWORDS[category] || CATEGORY_KEYWORDS.unknown;
  const selected: string[] = [];

  for (let i = 0; i < count && i < categoryKeywords.length; i++) {
    const keyword = randomItem(categoryKeywords);
    if (!selected.includes(keyword)) {
      selected.push(keyword);
    }
  }

  return selected;
}

/**
 * Generate unique session references
 */
function generateSessionRefs(count: number): string[] {
  const sessions: string[] = [];
  const prefixes = ['claude-code', 'omnidash', 'api-client', 'web-app', 'cli-tool'];

  for (let i = 0; i < count; i++) {
    const prefix = randomItem(prefixes);
    const sessionId = randomUUID().substring(0, 8);
    sessions.push(`${prefix}-session-${sessionId}`);
  }

  return sessions;
}

// ============================================================================
// Event Generators
// ============================================================================

/**
 * Generate an IntentClassifiedEvent
 */
function generateIntentClassifiedEvent(sessionId: string): IntentClassifiedEvent {
  const category = selectWeightedCategory();

  return {
    event_type: EVENT_TYPE_NAMES.INTENT_CLASSIFIED,
    session_id: sessionId,
    correlation_id: randomUUID(),
    intent_category: category,
    confidence: randomConfidence(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate an IntentStoredEvent (complementary to classified events)
 */
function generateIntentStoredEvent(
  sessionRef: string,
  category: IntentCategory,
  confidence: number
): IntentStoredEvent {
  return {
    event_type: EVENT_TYPE_NAMES.INTENT_STORED,
    correlation_id: randomUUID(),
    intent_id: randomUUID(),
    session_ref: sessionRef,
    intent_category: category,
    confidence,
    keywords: generateKeywords(category, randomInt(2, 5)),
    created: true,
    stored_at: new Date().toISOString(),
    execution_time_ms: randomInt(5, 50),
    status: 'success',
  };
}

// ============================================================================
// Main Seed Functions
// ============================================================================

interface SeedOptions {
  count: number;
  includeStored: boolean;
}

async function seedEventsOnce(options: SeedOptions): Promise<void> {
  const { count, includeStored } = options;

  console.log(`\n\x1b[32mSeeding ${count} intent events to Kafka...\x1b[0m\n`);

  try {
    await producer.connect();
    console.log('\x1b[32mProducer connected to Kafka\x1b[0m\n');

    // Generate unique sessions (5-10 unique sessions)
    const sessionCount = Math.min(Math.max(5, Math.floor(count / 5)), 10);
    const sessions = generateSessionRefs(sessionCount);
    console.log(`Generated ${sessionCount} unique sessions\n`);

    let classifiedCount = 0;
    let storedCount = 0;

    for (let i = 0; i < count; i++) {
      const sessionId = randomItem(sessions);
      const classifiedEvent = generateIntentClassifiedEvent(sessionId);

      // Publish IntentClassifiedEvent
      await producer.send({
        topic: INTENT_CLASSIFIED_TOPIC,
        messages: [
          {
            key: sessionId,
            value: JSON.stringify(classifiedEvent),
          },
        ],
      });
      classifiedCount++;

      // Optionally publish IntentStoredEvent
      if (includeStored) {
        const storedEvent = generateIntentStoredEvent(
          sessionId,
          classifiedEvent.intent_category as IntentCategory,
          classifiedEvent.confidence
        );

        await producer.send({
          topic: INTENT_STORED_TOPIC,
          messages: [
            {
              key: sessionId,
              value: JSON.stringify(storedEvent),
            },
          ],
        });
        storedCount++;
      }

      // Progress indicator
      if ((i + 1) % 10 === 0 || i === count - 1) {
        process.stdout.write(`\rPublished ${i + 1}/${count} events...`);
      }
    }

    console.log('\n\n\x1b[32mAll events published successfully!\x1b[0m\n');
    console.log('Summary:');
    console.log(`   - Intent classified events: ${classifiedCount}`);
    if (includeStored) {
      console.log(`   - Intent stored events: ${storedCount}`);
    }
    console.log(`   - Unique sessions: ${sessionCount}`);
    console.log(`   - Topic: ${INTENT_CLASSIFIED_TOPIC}`);
    if (includeStored) {
      console.log(`   - Topic: ${INTENT_STORED_TOPIC}`);
    }
    console.log('\nCheck the Intent Dashboard at http://localhost:3000/intents to see the data\n');
  } finally {
    await producer.disconnect();
    console.log('Producer disconnected\n');
  }
}

async function seedEventsContinuous(producer: Producer, sessions: string[]): Promise<void> {
  const sessionId = randomItem(sessions);
  const classifiedEvent = generateIntentClassifiedEvent(sessionId);

  await producer.send({
    topic: INTENT_CLASSIFIED_TOPIC,
    messages: [
      {
        key: sessionId,
        value: JSON.stringify(classifiedEvent),
      },
    ],
  });

  const now = new Date().toISOString().substring(11, 19);
  console.log(
    `[${now}] Published: category=${classifiedEvent.intent_category}, ` +
      `confidence=${classifiedEvent.confidence.toFixed(2)}, session=${sessionId.substring(0, 20)}...`
  );
}

async function startContinuousMode(): Promise<void> {
  console.log('\n\x1b[32mStarting continuous intent event seeding...\x1b[0m');
  console.log('Press Ctrl+C to stop\n');

  try {
    await producer.connect();
    console.log('\x1b[32mProducer connected to Kafka\x1b[0m\n');

    // Generate 8 unique sessions for continuous mode
    const sessions = generateSessionRefs(8);
    console.log(`Using ${sessions.length} rotating sessions\n`);

    let running = true;

    // Graceful shutdown handler
    const shutdown = async () => {
      console.log('\n\nShutting down gracefully...');
      running = false;
      await producer.disconnect();
      console.log('Producer disconnected');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Continuous event loop
    while (running) {
      await seedEventsContinuous(producer, sessions);

      // Random delay between 2-5 seconds
      const delay = randomInt(2000, 5000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  } catch (error) {
    console.error('\x1b[31mError in continuous mode:\x1b[0m', error);
    await producer.disconnect();
    process.exit(1);
  }
}

// ============================================================================
// CLI Handling
// ============================================================================

function printHelp(): void {
  console.log(`
\x1b[1mSeed Intent Events Script\x1b[0m

Publishes test intent classification events to Kafka for dashboard testing.

\x1b[1mUsage:\x1b[0m
  npx tsx scripts/seed-intent-events.ts [options]

\x1b[1mOptions:\x1b[0m
  --help, -h          Show this help message
  --once              Generate events once and exit (default)
  --continuous        Generate events continuously (1 event every 2-5 seconds)
  --count <number>    Number of events to generate in --once mode (default: 30)
  --include-stored    Also publish IntentStoredEvent to the stored topic

\x1b[1mExamples:\x1b[0m
  npx tsx scripts/seed-intent-events.ts                  # Generate 30 events once
  npx tsx scripts/seed-intent-events.ts --count 50       # Generate 50 events once
  npx tsx scripts/seed-intent-events.ts --continuous     # Continuous mode
  npx tsx scripts/seed-intent-events.ts --include-stored # Include stored events

\x1b[1mTopics:\x1b[0m
  - ${INTENT_CLASSIFIED_TOPIC}
  - ${INTENT_STORED_TOPIC} (with --include-stored)

\x1b[1mCategories:\x1b[0m
  ${VALID_INTENT_CATEGORIES.join(', ')}

\x1b[1mEnvironment:\x1b[0m
  KAFKA_BROKERS or KAFKA_BOOTSTRAP_SERVERS must be set
  Current: ${brokers}
`);
}

function parseArgs(): {
  mode: 'once' | 'continuous' | 'help';
  count: number;
  includeStored: boolean;
} {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    return { mode: 'help', count: 30, includeStored: false };
  }

  const mode = args.includes('--continuous') ? 'continuous' : 'once';
  const includeStored = args.includes('--include-stored');

  let count = 30; // Default
  const countIndex = args.indexOf('--count');
  if (countIndex !== -1 && args[countIndex + 1]) {
    const parsed = parseInt(args[countIndex + 1], 10);
    if (!isNaN(parsed) && parsed > 0) {
      count = Math.min(parsed, 500); // Cap at 500
    }
  }

  return { mode, count, includeStored };
}

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  const { mode, count, includeStored } = parseArgs();

  if (mode === 'help') {
    printHelp();
    process.exit(0);
  }

  if (mode === 'continuous') {
    await startContinuousMode();
  } else {
    await seedEventsOnce({ count, includeStored });
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\x1b[31mFatal error:\x1b[0m', error);
    process.exit(1);
  });
