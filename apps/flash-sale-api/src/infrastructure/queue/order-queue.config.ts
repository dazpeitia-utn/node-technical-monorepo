import type { ConnectionOptions, DefaultJobOptions } from 'bullmq';

export const PROCESS_ORDER_JOB = 'process-order';

/** Queue name (overridable so tests and parallel environments don't share jobs). */
export function orderQueueName(): string {
  return process.env.ORDER_QUEUE_NAME || 'orders';
}

/**
 * Connection options (not a shared client): BullMQ creates its own connections.
 * Workers use blocking commands, which require `maxRetriesPerRequest: null`.
 */
export function bullmqConnection(): ConnectionOptions {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: null,
  };
}

export const ORDER_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1_000 }, // 1s, 2s between retries
  removeOnComplete: { age: 60 * 60, count: 10_000 }, // keep 1h (for GET /orders/:id races)
  removeOnFail: { age: 24 * 60 * 60 }, // keep failures 24h for inspection
};

export function workerConcurrency(): number {
  return Number(process.env.ORDER_WORKER_CONCURRENCY) || 10;
}

/** Optional artificial delay per job, to simulate slow integrations (payment, inventory) in load tests. */
export function processingDelayMs(): number {
  return Number(process.env.ORDER_PROCESSING_DELAY_MS) || 0;
}
