import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateOrderUseCase } from '../../src/application/use-cases/CreateOrderUseCase';
import { OrderController } from '../../src/infrastructure/inbound/http/OrderController';
import { AuthenticatedRequest } from '../../src/infrastructure/inbound/http/guards/jwt-auth.guard';
import { InMemoryOrderRepository } from '../../src/infrastructure/outbound/InMemoryOrderRepository';
import { FakeRedisService } from '../helpers/FakeRedisService';
import { OTHER_PRODUCT_ID, PRODUCT_ID, USER_ID } from '../helpers/fixtures';

const asUser = (userId: string) => ({ user: { userId, email: `${userId}@example.com` } }) as AuthenticatedRequest;

describe('OrderController – truly simultaneous requests', () => {
  let orderRepository: InMemoryOrderRepository;
  let redis: FakeRedisService;
  let controller: OrderController;

  beforeEach(() => {
    orderRepository = new InMemoryOrderRepository();
    redis = new FakeRedisService();
    controller = new OrderController(new CreateOrderUseCase(orderRepository), redis.asRedisService());
  });

  const fire = (n: number, makeReq: (i: number) => AuthenticatedRequest, productId = PRODUCT_ID) =>
    Promise.allSettled(Array.from({ length: n }, (_, i) => controller.create({ productId, quantity: 1 }, makeReq(i))));

  it('lets exactly one of N simultaneous identical requests through (atomic SET NX)', async () => {
    const save = vi.spyOn(orderRepository, 'save');

    const results = await fire(10, () => asUser(USER_ID));

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(9);
    rejected.forEach((r) => expect(r.reason.getStatus()).toBe(429));
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('does not block different users buying the same product at the same time', async () => {
    const results = await fire(10, (i) => asUser(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`));

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('does not block the same user buying different products at the same time', async () => {
    const results = await Promise.allSettled([
      controller.create({ productId: PRODUCT_ID, quantity: 1 }, asUser(USER_ID)),
      controller.create({ productId: OTHER_PRODUCT_ID, quantity: 1 }, asUser(USER_ID)),
    ]);

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('releases the lock when the order fails, so the user can retry immediately', async () => {
    vi.spyOn(orderRepository, 'save').mockRejectedValueOnce(new Error('db down'));

    await expect(controller.create({ productId: PRODUCT_ID, quantity: 1 }, asUser(USER_ID))).rejects.toThrow('db down');
    expect(redis.releaseCalls).toEqual([{ key: `lock:order:${USER_ID}:${PRODUCT_ID}`, released: true }]);

    await expect(controller.create({ productId: PRODUCT_ID, quantity: 1 }, asUser(USER_ID))).resolves.toMatchObject({
      message: 'Order created successfully',
    });
  });

  it('keeps the lock after a successful order (anti double-click)', async () => {
    await controller.create({ productId: PRODUCT_ID, quantity: 1 }, asUser(USER_ID));

    expect(redis.releaseCalls).toHaveLength(0);
  });

  it('still answers with the original error if releasing the lock fails', async () => {
    vi.spyOn(orderRepository, 'save').mockRejectedValueOnce(new Error('db down'));
    vi.spyOn(redis, 'releaseLock').mockRejectedValueOnce(new Error('redis down'));

    await expect(controller.create({ productId: PRODUCT_ID, quantity: 1 }, asUser(USER_ID))).rejects.toThrow('db down');
  });
});
