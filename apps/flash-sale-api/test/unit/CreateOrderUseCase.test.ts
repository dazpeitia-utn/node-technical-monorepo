import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateOrderUseCase } from '../../src/application/use-cases/CreateOrderUseCase';
import { Order } from '../../src/domain/model/Order';
import { IOrderQueue } from '../../src/ports/outbound/IOrderQueue';
import { InMemoryOrderQueue } from '../helpers/InMemoryOrderQueue';
import { PRODUCT_ID, USER_ID } from '../helpers/fixtures';

const command = (quantity: number) => ({ productId: PRODUCT_ID, userId: USER_ID, quantity });

describe('CreateOrderUseCase (enqueue, non-blocking)', () => {
  let orderQueue: InMemoryOrderQueue;
  let createOrderUseCase: CreateOrderUseCase;

  beforeEach(() => {
    orderQueue = new InMemoryOrderQueue();
    createOrderUseCase = new CreateOrderUseCase(orderQueue);
  });

  describe('happy path', () => {
    it('returns a PENDING order with the command data', async () => {
      const order = await createOrderUseCase.execute(command(2));

      expect(order).toBeInstanceOf(Order);
      expect(order.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(order).toMatchObject({ productId: PRODUCT_ID, userId: USER_ID, quantity: 2, status: 'PENDING' });
    });

    it('enqueues the order for the worker (jobId = order id)', async () => {
      const order = await createOrderUseCase.execute(command(1));

      expect(orderQueue.waiting()).toEqual([
        expect.objectContaining({ orderId: order.id, productId: PRODUCT_ID, userId: USER_ID, quantity: 1 }),
      ]);
    });

    it('generates a different id for every order', async () => {
      const [a, b] = await Promise.all([createOrderUseCase.execute(command(1)), createOrderUseCase.execute(command(1))]);

      expect(a.id).not.toBe(b.id);
      expect(orderQueue.waiting()).toHaveLength(2);
    });
  });

  describe('validation (synchronous, before enqueueing)', () => {
    it.each([0, -1, -100])('rejects quantity %i', async (quantity) => {
      await expect(createOrderUseCase.execute(command(quantity))).rejects.toThrowError(
        'Quantity must be greater than zero',
      );
    });

    it('does not enqueue anything when the order is invalid', async () => {
      await expect(createOrderUseCase.execute(command(0))).rejects.toThrow();

      expect(orderQueue.enqueueCalls).toBe(0);
    });
  });

  describe('queue failures', () => {
    it('propagates enqueue errors to the caller (e.g. Redis down)', async () => {
      const failingQueue: IOrderQueue = {
        enqueue: vi.fn().mockRejectedValue(new Error('redis unavailable')),
        findQueued: vi.fn(),
      };
      const useCase = new CreateOrderUseCase(failingQueue);

      await expect(useCase.execute(command(1))).rejects.toThrowError('redis unavailable');
      expect(failingQueue.enqueue).toHaveBeenCalledWith(expect.any(Order));
    });
  });
});
