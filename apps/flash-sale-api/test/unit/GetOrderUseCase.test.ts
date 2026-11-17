import { beforeEach, describe, expect, it } from 'vitest';
import { GetOrderUseCase } from '../../src/application/use-cases/GetOrderUseCase';
import { ProcessOrderUseCase } from '../../src/application/use-cases/ProcessOrderUseCase';
import { OrderNotFoundError } from '../../src/domain/errors/OrderNotFoundError';
import { Order } from '../../src/domain/model/Order';
import { InMemoryOrderRepository } from '../../src/infrastructure/outbound/InMemoryOrderRepository';
import { InMemoryOrderQueue } from '../helpers/InMemoryOrderQueue';
import { OTHER_USER_ID, PRODUCT_ID, USER_ID } from '../helpers/fixtures';

describe('GetOrderUseCase', () => {
  let orderRepository: InMemoryOrderRepository;
  let orderQueue: InMemoryOrderQueue;
  let getOrder: GetOrderUseCase;
  let order: Order;

  beforeEach(async () => {
    orderRepository = new InMemoryOrderRepository();
    orderQueue = new InMemoryOrderQueue();
    getOrder = new GetOrderUseCase(orderRepository, orderQueue);
    order = Order.create(PRODUCT_ID, USER_ID, 1);
    await orderQueue.enqueue(order);
  });

  it('returns PENDING while the order is still in the queue', async () => {
    expect((await getOrder.execute(order.id, USER_ID)).status).toBe('PENDING');
  });

  it('returns the persisted status once the worker processed it', async () => {
    await orderQueue.drain(new ProcessOrderUseCase(orderRepository));

    expect((await getOrder.execute(order.id, USER_ID)).status).toBe('CONFIRMED');
  });

  it('returns REJECTED when the job failed for good and is only in the failed set', async () => {
    orderQueue.markFailed(order.id);

    expect((await getOrder.execute(order.id, USER_ID)).status).toBe('REJECTED');
  });

  it('prefers PostgreSQL over the queue', async () => {
    await orderRepository.save(order.confirm());

    expect((await getOrder.execute(order.id, USER_ID)).status).toBe('CONFIRMED');
  });

  it("reports another user's order as not found (no id probing)", async () => {
    await expect(getOrder.execute(order.id, OTHER_USER_ID)).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it('throws OrderNotFoundError for an unknown id', async () => {
    await expect(getOrder.execute('00000000-0000-4000-8000-000000000000', USER_ID)).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });
});
