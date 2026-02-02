#!/usr/bin/env npx tsx
/* eslint-disable no-console */
/**
 * Event Recording Script
 *
 * Captures real Kafka events and saves them to a JSONL file for demo playback.
 * Run locally where Kafka is available, then upload the recording to Replit.
 *
 * Usage:
 *   npx tsx scripts/record-events.ts [options]
 *
 * Options:
 *   --duration <seconds>   Recording duration (default: 60)
 *   --output <file>        Output file path (default: demo/recordings/events-{timestamp}.jsonl)
 *   --topics <list>        Comma-separated topic list (default: all subscribed topics)
 *
 * Examples:
 *   npx tsx scripts/record-events.ts --duration 120
 *   npx tsx scripts/record-events.ts --output demo/recordings/full-demo.jsonl
 */

import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

// Configuration
const KAFKA_BROKERS = (process.env.KAFKA_BOOTSTRAP_SERVERS || '192.168.86.200:29092').split(',');
const DEFAULT_DURATION_SECONDS = 60;

// Topics to record - same as event-consumer.ts
const DEFAULT_TOPICS = [
  // Agent topics
  'agent-routing-decisions',
  'agent-transformation-events',
  'router-performance-metrics',
  'agent-actions',
  // Pattern learning topics
  'agent-manifest-injections',
  // Node registry topics (legacy)
  'dev.omninode_bridge.onex.evt.node-introspection.v1',
  'dev.onex.evt.registration-completed.v1',
  'node.heartbeat',
  'dev.omninode_bridge.onex.evt.registry-request-introspection.v1',
  // Intent topics
  'dev.onex.evt.omniintelligence.intent-classified.v1',
  'dev.onex.evt.omnimemory.intent-stored.v1',
  'dev.onex.evt.omnimemory.intent-query-response.v1',
  // Canonical ONEX topics
  'dev.onex.evt.node-became-active.v1',
  'dev.onex.evt.node-liveness-expired.v1',
  'dev.onex.evt.node-heartbeat.v1',
  'dev.onex.evt.node-introspection.v1',
  // OmniClaude hook events
  'dev.onex.cmd.omniintelligence.claude-hook-event.v1',
  'dev.onex.evt.omniclaude.prompt-submitted.v1',
  'dev.onex.evt.omniclaude.session-started.v1',
  'dev.onex.evt.omniclaude.tool-executed.v1',
  'dev.onex.evt.omniclaude.session-ended.v1',
];

interface RecordedEvent {
  timestamp: string;
  relativeMs: number; // Milliseconds from recording start
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  value: unknown;
}

async function parseArgs(): Promise<{
  duration: number;
  output: string;
  topics: string[];
}> {
  const args = process.argv.slice(2);
  let duration = DEFAULT_DURATION_SECONDS;
  let output = '';
  let topics = DEFAULT_TOPICS;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--duration':
        duration = parseInt(args[++i], 10);
        break;
      case '--output':
        output = args[++i];
        break;
      case '--topics':
        topics = args[++i].split(',').map((t) => t.trim());
        break;
    }
  }

  // Default output path with timestamp
  if (!output) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    output = `demo/recordings/events-${timestamp}.jsonl`;
  }

  return { duration, output, topics };
}

async function recordEvents(): Promise<void> {
  const { duration, output, topics } = await parseArgs();

  console.log('='.repeat(60));
  console.log('Event Recording');
  console.log('='.repeat(60));
  console.log(`Duration:    ${duration} seconds`);
  console.log(`Output:      ${output}`);
  console.log(`Topics:      ${topics.length} topics`);
  console.log(`Brokers:     ${KAFKA_BROKERS.join(', ')}`);
  console.log('='.repeat(60));

  // Ensure output directory exists
  const outputDir = path.dirname(output);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created directory: ${outputDir}`);
  }

  // Initialize Kafka
  const kafka = new Kafka({
    clientId: 'omnidash-event-recorder',
    brokers: KAFKA_BROKERS,
  });

  const consumer: Consumer = kafka.consumer({
    groupId: `omnidash-recorder-${Date.now()}`, // Unique group to read from beginning
  });

  const events: RecordedEvent[] = [];
  const startTime = Date.now();

  try {
    await consumer.connect();
    console.log('Connected to Kafka');

    // Subscribe to all topics
    await consumer.subscribe({
      topics,
      fromBeginning: false, // Only record new events
    });

    console.log(`\nRecording started at ${new Date().toISOString()}`);
    console.log(`Will stop after ${duration} seconds or Ctrl+C\n`);

    // Set up message handler
    await consumer.run({
      eachMessage: async ({ topic, partition, message }: EachMessagePayload) => {
        const now = Date.now();
        const relativeMs = now - startTime;

        let value: unknown;
        try {
          value = JSON.parse(message.value?.toString() || '{}');
        } catch {
          value = message.value?.toString() || '';
        }

        const event: RecordedEvent = {
          timestamp: new Date(now).toISOString(),
          relativeMs,
          topic,
          partition,
          offset: message.offset,
          key: message.key?.toString() || null,
          value,
        };

        events.push(event);

        // Progress indicator
        const elapsed = Math.floor(relativeMs / 1000);
        process.stdout.write(
          `\rRecorded: ${events.length} events | Elapsed: ${elapsed}s / ${duration}s`
        );
      },
    });

    // Wait for duration
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, duration * 1000);

      // Handle Ctrl+C gracefully
      process.once('SIGINT', () => {
        console.log('\n\nReceived SIGINT, stopping...');
        clearTimeout(timer);
        resolve();
      });
    });
  } finally {
    await consumer.disconnect();
    console.log('\n\nDisconnected from Kafka');
  }

  // Write events to file
  if (events.length > 0) {
    const outputPath = path.resolve(output);
    const content = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
    fs.writeFileSync(outputPath, content);

    console.log('\n' + '='.repeat(60));
    console.log('Recording Complete');
    console.log('='.repeat(60));
    console.log(`Events recorded: ${events.length}`);
    console.log(`Duration:        ${Math.floor((Date.now() - startTime) / 1000)} seconds`);
    console.log(`File size:       ${(content.length / 1024).toFixed(2)} KB`);
    console.log(`Output file:     ${outputPath}`);
    console.log('='.repeat(60));

    // Print topic breakdown
    const topicCounts = events.reduce(
      (acc, e) => {
        acc[e.topic] = (acc[e.topic] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    console.log('\nEvents by topic:');
    Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([topic, count]) => {
        console.log(`  ${topic}: ${count}`);
      });
  } else {
    console.log('\nNo events recorded. Make sure there is activity on the subscribed topics.');
  }
}

recordEvents().catch((err) => {
  console.error('Recording failed:', err);
  process.exit(1);
});
