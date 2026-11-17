import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateOrderUseCase } from '../../src/application/use-cases/CreateOrderUseCase';
import { Order } from '../../src/domain/model/Order';
import { InMemoryOrderRepository } from '../../src/infrastructure/outbound/InMemoryOrderRepository';
import { IOrderRepository } from '../../src/ports/outbound/IOrderRepository';
import { PRODUCT_ID, USER_ID } from '../helpers/fixtures';

const command = (quantity: number) => ({ productId: PRODUCT_ID, userId: USER_ID, quantity });

describe('CreateOrderUseCase', () => {
  let orderRepository: InMemoryOrderRepository;
  let createOrderUseCase: CreateOrderUseCase;

  beforeEach(() => {
    orderRepository = new InMemoryOrderRepository();
    createOrderUseCase = new CreateOrderUseCase(orderRepository);
  });

  describe('happy path', () => {
    it('creates an order with PENDING status and the command data', async () => {
      const order = await createOrderUseCase.execute(command(2));

      expect(order).toBeInstanceOf(Order);
      expect(order.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(order).toMatchObject({ productId: PRODUCT_ID, userId: USER_ID, quantity: 2, status: 'PENDING' });
    });

    it('persists the order through the repository port', async () => {
      const order = await createOrderUseCase.execute(command(1));

      expect(await orderRepository.findById(order.id)).toEqual(order);
    });

    it('generates a different id for every order', async () => {
      const [a, b] = await Promise.all([createOrderUseCase.execute(command(1)), createOrderUseCase.execute(command(1))]);

      expect(a.id).not.toBe(b.id);
    });
  });

  describe('validation', () => {
    it.each([0, -1, -100])('rejects quantity %i', async (quantity) => {
      await expect(createOrderUseCase.execute(command(quantity))).rejects.toThrowError(
        'Quantity must be greater than zero',
      );
    });

    it('does not persist anything when the order is invalid', async () => {
      const save = vi.spyOn(orderRepository, 'save');

      await expect(createOrderUseCase.execute(command(0))).rejects.toThrow();

      expect(save).not.toHaveBeenCalled();
    });
  });

  describe('repository failures', () => {
    it('propagates persistence errors to the caller', async () => {
      const failingRepository: IOrderRepository = {
        save: vi.fn().mockRejectedValue(new Error('connection lost')),
        findById: vi.fn(),
      };
      const useCase = new CreateOrderUseCase(failingRepository);

      await expect(useCase.execute(command(1))).rejects.toThrowError('connection lost');
      expect(failingRepository.save).toHaveBeenCalledWith(expect.any(Order));
    });
  });
});
