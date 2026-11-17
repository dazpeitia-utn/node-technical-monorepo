import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessOrderUseCase } from '../../src/application/use-cases/ProcessOrderUseCase';
import { Order } from '../../src/domain/model/Order';
import { InMemoryOrderRepository } from '../../src/infrastructure/outbound/InMemoryOrderRepository';
import { PRODUCT_ID, USER_ID } from '../helpers/fixtures';

describe('ProcessOrderUseCase (background worker)', () => {
  let orderRepository: InMemoryOrderRepository;
  let processOrder: ProcessOrderUseCase;
  let pending: Order;

  beforeEach(() => {
    orderRepository = new InMemoryOrderRepository();
    processOrder = new ProcessOrderUseCase(orderRepository);
    pending = Order.create(PRODUCT_ID, USER_ID, 2);
  });

  describe('execute (confirm)', () => {
    it('persists the order as CONFIRMED', async () => {
      const result = await processOrder.execute(pending);

      expect(result.status).toBe('CONFIRMED');
      expect(await orderRepository.findById(pending.id)).toMatchObject({ id: pending.id, quantity: 2, status: 'CONFIRMED' });
    });

    it('is idempotent: processing the same job twice writes once and keeps one order', async () => {
      const save = vi.spyOn(orderRepository, 'save');

      await processOrder.execute(pending);
      const second = await processOrder.execute(pending);

      expect(second.status).toBe('CONFIRMED');
      expect(save).toHaveBeenCalledTimes(1);
    });

    it('does not turn a REJECTED order into CONFIRMED on a late retry', async () => {
      await orderRepository.save(pending.reject());

      expect((await processOrder.execute(pending)).status).toBe('REJECTED');
    });

    it('propagates repository errors so the queue retries the job', async () => {
      vi.spyOn(orderRepository, 'save').mockRejectedValueOnce(new Error('db down'));

      await expect(processOrder.execute(pending)).rejects.toThrow('db down');
    });
  });

  describe('reject (retries exhausted)', () => {
    it('persists the order as REJECTED', async () => {
      expect((await processOrder.reject(pending)).status).toBe('REJECTED');
      expect((await orderRepository.findById(pending.id))?.status).toBe('REJECTED');
    });

    it('never overrides an order that was already CONFIRMED', async () => {
      await processOrder.execute(pending);

      expect((await processOrder.reject(pending)).status).toBe('CONFIRMED');
    });
  });
});
