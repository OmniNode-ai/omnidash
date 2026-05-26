import { Kafka, Producer, logLevel } from 'kafkajs';

const KAFKA_BROKERS = (process.env.KAFKA_BROKERS ?? 'localhost:19092').split(',');

const kafka = new Kafka({
  clientId: 'omnidash-server',
  brokers: KAFKA_BROKERS,
  logLevel: logLevel.WARN,
});

let producer: Producer | null = null;
let connected = false;

export async function connectProducer(): Promise<void> {
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
