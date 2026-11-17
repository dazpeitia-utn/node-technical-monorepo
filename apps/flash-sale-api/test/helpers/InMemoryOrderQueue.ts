import { type ProcessOrderUseCase } from '../../src/application/use-cases/ProcessOrderUseCase';
import { type Order } from '../../src/domain/model/Order';
import { type IOrderQueue, type OrderJobData, type QueuedOrder, fromOrderJobData, toOrderJobData } from '../../src/ports/outbound/IOrderQueue';

/**
 * In-memory IOrderQueue. Like BullMQ with jobId = orderId, enqueueing the same order twice
 * keeps a single job. `drain()` plays the role of the worker in tests.
 */
export class InMemoryOrderQueue implements IOrderQueue {
  readonly jobs = new Map<string, { data: OrderJobData; state: 'waiting' | 'failed'; failedReason?: string }>();
  enqueueCalls = 0;

  async enqueue(order: Order): Promise<void> {
    this.enqueueCalls++;
    if (!this.jobs.has(order.id)) {
      this.jobs.set(order.id, { data: toOrderJobData(order), state: 'waiting' });
    }
  }

  async findQueued(orderId: string): Promise<QueuedOrder | null> {
    const job = this.jobs.get(orderId);
    if (!job) return null;
    const order = fromOrderJobData(job.data);
    return job.state === 'failed' ? { order: order.reject(), failedReason: job.failedReason } : { order };
  }

  waiting(): OrderJobData[] {
    return [...this.jobs.values()].filter((j) => j.state === 'waiting').map((j) => j.data);
  }

  /** Simulates the worker: processes every waiting job and removes it from the queue. */
  async drain(processOrder: ProcessOrderUseCase): Promise<void> {
    for (const data of this.waiting()) {
      await processOrder.execute(fromOrderJobData(data));
      this.jobs.delete(data.orderId);
    }
  }

  /** Simulates a job that failed for good (kept in the failed set, like BullMQ). */
  markFailed(orderId: string, reason = 'processing failed'): void {
    const job = this.jobs.get(orderId);
    if (job) Object.assign(job, { state: 'failed', failedReason: reason });
  }

  clear(): void {
    this.jobs.clear();
    this.enqueueCalls = 0;
  }
}
