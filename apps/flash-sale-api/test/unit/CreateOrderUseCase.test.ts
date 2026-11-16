import { describe, it, expect, beforeEach } from 'vitest';
import { CreateOrderUseCase } from '../../src/application/use-cases/CreateOrderUseCase';
import { InMemoryOrderRepository } from '../../src/infrastructure/outbound/InMemoryOrderRepository';

describe('CreateOrderUseCase', () => {
  let orderRepository: InMemoryOrderRepository;
  let createOrderUseCase: CreateOrderUseCase;

  beforeEach(() => {
    orderRepository = new InMemoryOrderRepository();
    createOrderUseCase = new CreateOrderUseCase(orderRepository);
  });

  it('should successfully create and save an order with PENDING status', async () => {
    const command = {
      productId: '123e4567-e89b-12d3-a456-426614174000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
      quantity: 2,
    };

    const order = await createOrderUseCase.execute(command);

    expect(order).toBeDefined();
    expect(order.id).toBeTypeOf('string');
    expect(order.status).toBe('PENDING');
    expect(order.quantity).toBe(2);
  });

  it('should throw an error if quantity is zero or negative', () => {
    const command = {
      productId: '123e4567-e89b-12d3-a456-426614174000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
      quantity: 0,
    };

    expect(() => createOrderUseCase.execute(command)).rejects.toThrowError(
      'Quantity must be greater than zero'
    );
  });
});