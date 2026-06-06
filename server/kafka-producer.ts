import { Kafka, Producer, logLevel } from 'kafkajs';
import { loadEventBusConfig } from './data-source-contract.js';

let producer: Producer | null = null;
let connected = false;

export async function connectProducer(): Promise<void> {
  const config = loadEventBusConfig();
  if (config.bootstrapServers.length === 0) {
    throw new Error('event_bus.bootstrap_servers missing; configure contract.local.yaml or a deployment overlay');
  }
  const kafka = new Kafka({
    clientId: config.clientId,
    brokers: config.bootstrapServers,
    logLevel: logLevel.WARN,
  });
  producer = kafka.producer();
  await producer.connect();
  connected = true;
}

export async function disconnectProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    connected = false;
    producer = null;
  }
}

export function isProducerConnected(): boolean {
  return connected;
}

export async function publishMessage(topic: string, value: unknown): Promise<void> {
  if (!producer || !connected) {
    throw new Error('kafka_unavailable');
  }
  await producer.send({
    topic,
    messages: [{ value: JSON.stringify(value) }],
  });
}
