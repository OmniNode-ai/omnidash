#!/usr/bin/env tsx

/**
 * Kafka Topic Checker
 *
 * Checks the status of Kafka topics and consumer group offsets
 * Run with: npm run check-topics or tsx scripts/check-kafka-topics.ts
 */

import { Kafka } from 'kafkajs';

const kafka = new Kafka({
  brokers: (process.env.KAFKA_BROKERS || '192.168.86.200:9092').split(','),
  clientId: 'omnidash-topic-checker',
});

const TOPICS_TO_CHECK = [
  'agent-routing-decisions',
  'agent-transformation-events',
  'router-performance-metrics',
  'agent-actions',
];

const CONSUMER_GROUP = 'omnidash-consumers-v2';

async function checkTopics() {
  const admin = kafka.admin();

  try {
    await admin.connect();
    console.warn('✅ Connected to Kafka\n');

    // Fetch topic metadata
    console.warn('📊 Topic Information:\n');
    const topics = await admin.fetchTopicMetadata({ topics: TOPICS_TO_CHECK });

    for (const topic of topics.topics) {
      console.warn(`Topic: ${topic.name}`);
      console.warn(`  Partitions: ${topic.partitions.length}`);

      for (const partition of topic.partitions) {
        console.warn(`    Partition ${partition.partitionId}:`);
        console.warn(`      Leader: ${partition.leader}`);
        console.warn(`      Replicas: ${partition.replicas.join(', ')}`);
        console.warn(`      ISR: ${partition.isr.join(', ')}`);
      }

      // Fetch topic offsets (high water mark = number of messages)
      const offsets = await admin.fetchTopicOffsets(topic.name);
      const totalMessages = offsets.reduce((sum, o) => sum + parseInt(o.high), 0);
      console.warn(`  📬 Total messages: ${totalMessages}\n`);
    }

    // Check consumer group offsets
    console.warn(`\n👥 Consumer Group: ${CONSUMER_GROUP}\n`);
    try {
      const groups = await admin.describeGroups([CONSUMER_GROUP]);
      const group = groups.groups[0];

      if (group) {
        console.warn(`  State: ${group.state}`);
        console.warn(`  Protocol: ${group.protocol}`);
        console.warn(`  Members: ${group.members.length}`);

        for (const member of group.members) {
          console.warn(`    - ${member.memberId.substring(0, 40)}...`);
        }

        // Fetch consumer group offsets
        console.warn('\n  📖 Consumer Offsets:\n');
        const offsets = await admin.fetchOffsets({
          groupId: CONSUMER_GROUP,
          topics: TOPICS_TO_CHECK,
        });

        for (const topic of offsets) {
          console.warn(`  ${topic.topic}:`);
          for (const partition of topic.partitions) {
            const offset = partition.offset === '-1' ? 'No offset' : partition.offset;
            console.warn(`    Partition ${partition.partition}: ${offset}`);
          }
        }
      } else {
        console.warn('  ⚠️ Consumer group not found');
      }
    } catch (_error) {
      console.error(
        '  ⚠️ Error fetching consumer group info:',
        _error instanceof Error ? _error.message : _error
      );
    }

    console.warn('\n✅ Topic check complete\n');
  } catch (error) {
    console.error('❌ Error checking topics:', error);
    throw error;
  } finally {
    await admin.disconnect();
  }
}

checkTopics()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
