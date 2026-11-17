import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { setTimeout as sleep } from 'node:timers/promises';
import { ProcessOrderUseCase } from '../../../application/use-cases/ProcessOrderUseCase';
import { OrderJobData, fromOrderJobData } from '../../../ports/outbound/IOrderQueue';
import { bullmqConnection, orderQueueName, processingDelayMs, workerConcurrency } from '../../queue/order-queue.config';

export interface OrderWorkerOptions {
  queueName?: string;
  concurrency?: number;
  delayMs?: number;
}

export const ORDER_WORKER_OPTIONS = Symbol('ORDER_WORKER_OPTIONS');

/**
 * Inbound adapter: consumes the orders queue in the background and drives ProcessOrderUseCase.
 * Failed jobs are retried by BullMQ (see ORDER_JOB_OPTIONS); once the last attempt fails,
 * the order is marked REJECTED in PostgreSQL.
 */
@Injectable()
export class OrderWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderWorker.name);
  private worker?: Worker<OrderJobData>;

  constructor(
    @Inject(ProcessOrderUseCase) private readonly processOrder: ProcessOrderUseCase,
    @Inject(ORDER_WORKER_OPTIONS) private readonly options: OrderWorkerOptions = {},
  ) {}

  onModuleInit(): void {
    const queueName = this.options.queueName ?? orderQueueName();
    const concurrency = this.options.concurrency ?? workerConcurrency();
    const delayMs = this.options.delayMs ?? processingDelayMs();

    this.worker = new Worker<OrderJobData>(
      queueName,
      async (job) => {
        if (delayMs > 0) await sleep(delayMs);
        const order = await this.processOrder.execute(fromOrderJobData(job.data));
        return { status: order.status };
      },
      { connection: bullmqConnection(), concurrency },
    );

    this.worker.on('failed', (job, error) => void this.onFailed(job, error));
    this.worker.on('error', (error) => this.logger.error(`Worker error: ${error.message}`));
    this.logger.log(`Consuming queue "${queueName}" with concurrency ${concurrency}`);
  }

  private async onFailed(job: Job<OrderJobData> | undefined, error: Error): Promise<void> {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) {
      this.logger.warn(`Order ${job.id} failed (attempt ${job.attemptsMade}/${attempts}), retrying: ${error.message}`);
      return;
    }
    this.logger.error(`Order ${job.id} failed for good after ${attempts} attempts: ${error.message}`);
    try {
      await this.processOrder.reject(fromOrderJobData(job.data));
    } catch (rejectError) {
      // The job stays in the failed set (24h), so GET /orders/:id still reports REJECTED.
      this.logger.error(`Could not mark order ${job.id} as REJECTED: ${(rejectError as Error).message}`);
    }
  }

  /** Waits until the worker is connected (useful in tests). */
  async waitUntilReady(): Promise<void> {
    await this.worker?.waitUntilReady();
  }

  async onModuleDestroy(): Promise<void> {
    // Finishes the jobs in progress before closing (graceful shutdown).
    await this.worker?.close();
  }
}
