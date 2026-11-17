import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Order } from '../../domain/model/Order';
import {
  IOrderQueue,
  OrderJobData,
  QueuedOrder,
  fromOrderJobData,
  toOrderJobData,
} from '../../ports/outbound/IOrderQueue';
import { ORDER_JOB_OPTIONS, PROCESS_ORDER_JOB, bullmqConnection, orderQueueName } from '../queue/order-queue.config';

const PENDING_STATES = new Set(['waiting', 'delayed', 'active', 'prioritized', 'waiting-children', 'completed']);

/** Outbound adapter: IOrderQueue on top of a BullMQ queue in Redis. */
@Injectable()
export class BullMqOrderQueue implements IOrderQueue, OnModuleDestroy {
  private readonly queue: Queue<OrderJobData>;

  constructor(queueName = orderQueueName()) {
    this.queue = new Queue<OrderJobData>(queueName, {
      connection: bullmqConnection(),
      defaultJobOptions: ORDER_JOB_OPTIONS,
    });
  }

  async enqueue(order: Order): Promise<void> {
    // jobId = orderId: BullMQ ignores a second add with the same id, so enqueueing is idempotent.
    await this.queue.add(PROCESS_ORDER_JOB, toOrderJobData(order), { jobId: order.id });
  }

  async findQueued(orderId: string): Promise<QueuedOrder | null> {
    const job = await this.queue.getJob(orderId);
    if (!job) return null;

    const state = await job.getState();
    const order = fromOrderJobData(job.data);
    if (state === 'failed') {
      return { order: order.reject(), failedReason: job.failedReason };
    }
    // 'completed' only lasts until the row is visible in PostgreSQL; report it as still PENDING.
    return PENDING_STATES.has(state) ? { order } : null;
  }

  /** For tests and tooling. */
  get raw(): Queue<OrderJobData> {
    return this.queue;
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
