import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GetOrderUseCase } from '../../src/application/use-cases/GetOrderUseCase';
import { ProcessOrderUseCase } from '../../src/application/use-cases/ProcessOrderUseCase';
import { Order } from '../../src/domain/model/Order';
import { OrderWorker } from '../../src/infrastructure/inbound/queue/OrderWorker';
import { BullMqOrderQueue } from '../../src/infrastructure/outbound/BullMqOrderQueue';
import { InMemoryOrderRepository } from '../../src/infrastructure/outbound/InMemoryOrderRepository';
import { PRODUCT_ID, USER_ID } from '../helpers/fixtures';

/**
 * Against a REAL Redis with real BullMQ (docker compose up -d redis): queue → worker → repository.
 * Each test file run uses its own queue name, so a dev worker never steals these jobs.
 * Skipped automatically when Redis isn't reachable.
 */
async function isRedisReachable(): Promise<boolean> {
  const probe = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    connectTimeout: 500,
  });
  probe.on('error', () => undefined);
  try {
    await probe.connect();
    return (await probe.ping()) === 'PONG';
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

async function waitFor<T>(fn: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 10_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (done(value)) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor timed out; last value: ${JSON.stringify(value)}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('BullMQ order queue + worker (real Redis)', () => {
  const queueName = `test-orders-${randomUUID()}`;
  let redisAvailable = false;
  let queue: BullMqOrderQueue;
  let worker: OrderWorker;
  let orderRepository: InMemoryOrderRepository;
  let getOrder: GetOrderUseCase;

  beforeAll(async () => {
    redisAvailable = await isRedisReachable();
  });

  beforeEach(async (ctx) => {
    if (!redisAvailable) ctx.skip();
    orderRepository = new InMemoryOrderRepository();
    queue = new BullMqOrderQueue(queueName);
    // Same job options as production (3 attempts, 1s/2s exponential backoff).
    worker = new OrderWorker(new ProcessOrderUseCase(orderRepository), { queueName, concurrency: 5 });
    getOrder = new GetOrderUseCase(orderRepository, queue);
  });

  afterEach(async () => {
    if (!redisAvailable) return;
    await worker.onModuleDestroy();
    await queue.raw.obliterate({ force: true });
    await queue.onModuleDestroy();
  });

  const startWorker = async () => {
    worker.onModuleInit();
    await worker.waitUntilReady();
  };

  it('processes a queued order in the background: PENDING → CONFIRMED', async () => {
    const order = Order.create(PRODUCT_ID, USER_ID, 2);
    await queue.enqueue(order);

    // No worker yet: the order is only in the queue.
    expect((await getOrder.execute(order.id, USER_ID)).status).toBe('PENDING');
    expect(await orderRepository.findById(order.id)).toBeNull();

    await startWorker();

    const processed = await waitFor(() => orderRepository.findById(order.id), (o) => o !== null);
    expect(processed).toMatchObject({ id: order.id, quantity: 2, status: 'CONFIRMED' });
    expect((await getOrder.execute(order.id, USER_ID)).status).toBe('CONFIRMED');
  });

  it('enqueueing the same order twice creates a single job (jobId = orderId)', async () => {
    const order = Order.create(PRODUCT_ID, USER_ID, 1);

    await Promise.all([queue.enqueue(order), queue.enqueue(order), queue.enqueue(order)]);

    expect(await queue.raw.getJobCounts('waiting')).toEqual({ waiting: 1 });
  });

  it('processes 100 orders with concurrency and persists each exactly once', async () => {
    const orders = Array.from({ length: 100 }, () => Order.create(PRODUCT_ID, randomUUID(), 1));
    const save = vi.spyOn(orderRepository, 'save');
    await Promise.all(orders.map((o) => queue.enqueue(o)));

    await startWorker();

    await waitFor(async () => (await Promise.all(orders.map((o) => orderRepository.findById(o.id)))).filter(Boolean).length, (n) => n === 100);
    expect(save).toHaveBeenCalledTimes(100);
  });

  it('retries a failing job and confirms it once the dependency recovers', async () => {
    const order = Order.create(PRODUCT_ID, USER_ID, 1);
    vi.spyOn(orderRepository, 'save').mockRejectedValueOnce(new Error('db hiccup'));
    await queue.enqueue(order);

    await startWorker();

    // 1st attempt fails, BullMQ retries after the backoff (1s), 2nd attempt succeeds.
    const processed = await waitFor(() => orderRepository.findById(order.id), (o) => o !== null, 15_000);
    expect(processed?.status).toBe('CONFIRMED');
  }, 20_000);

  it('marks the order REJECTED when every attempt fails', async () => {
    const order = Order.create(PRODUCT_ID, USER_ID, 1);
    const realSave = orderRepository.save.bind(orderRepository);
    // Confirming always fails; the final REJECTED write succeeds.
    vi.spyOn(orderRepository, 'save').mockImplementation(async (o) => {
      if (o.status === 'CONFIRMED') throw new Error('payment provider down');
      return realSave(o);
    });
    await queue.enqueue(order);

    await startWorker();

    // 3 attempts with 1s + 2s backoff ≈ 3s.
    const rejected = await waitFor(() => orderRepository.findById(order.id), (o) => o !== null, 15_000);
    expect(rejected?.status).toBe('REJECTED');
    expect((await queue.findQueued(order.id))?.failedReason).toBe('payment provider down');
  }, 20_000);
});
