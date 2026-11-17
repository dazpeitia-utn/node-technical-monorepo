import { describe, expect, it } from 'vitest';
import { CreateOrderUseCase } from '../../src/application/use-cases/CreateOrderUseCase';
import { OrderController } from '../../src/infrastructure/inbound/http/OrderController';
import { AuthenticatedRequest } from '../../src/infrastructure/inbound/http/guards/jwt-auth.guard';
import { InMemoryOrderRepository } from '../../src/infrastructure/outbound/InMemoryOrderRepository';
import { FakeRedisService } from '../helpers/FakeRedisService';
import { PRODUCT_ID, USER_ID } from '../helpers/fixtures';

describe('OrderController – truly simultaneous requests', () => {
  /**
   * KNOWN BUG (documented with `it.fails`): the lock is a GET followed by a separate SET,
   * so two requests that run GET before either runs SET both get through.
   * The fix is an atomic `SET key value NX EX 3`, tracked in its own `fix/` branch.
   * When that lands, change `it.fails` to `it` (Vitest will flag it if the test starts passing).
   */
  it.fails('lets exactly one of N simultaneous identical requests through', async () => {
    const orderRepository = new InMemoryOrderRepository();
    const redis = new FakeRedisService();
    const controller = new OrderController(new CreateOrderUseCase(orderRepository), redis.asRedisService());
    const req = { user: { userId: USER_ID, email: 'ada@example.com' } } as AuthenticatedRequest;

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => controller.create({ productId: PRODUCT_ID, quantity: 1 }, req)),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});
