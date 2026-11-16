import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { OrderController } from '../../src/infrastructure/inbound/http/OrderController';
import { CreateOrderUseCase } from '../../src/application/use-cases/CreateOrderUseCase';
import { InMemoryOrderRepository } from '../../src/infrastructure/outbound/InMemoryOrderRepository';

const createTestApp = () => {
  const app = express();
  app.use(express.json());

  const orderRepo = new InMemoryOrderRepository();
  const createOrderUseCase = new CreateOrderUseCase(orderRepo);
  const orderController = new OrderController(createOrderUseCase);

  app.post('/orders', orderController.create);
  return app;
};

describe('POST /orders (Integration Test)', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
  });

  it('should create an order successfully when payload is valid', async () => {
    const validPayload = {
      productId: '123e4567-e89b-12d3-a456-426614174000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
      quantity: 3,
    };

    const response = await request(app)
      .post('/orders')
      .send(validPayload);

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Order created successfully');
    expect(response.body.data).toHaveProperty('id');
    expect(response.body.data.status).toBe('PENDING');
  });

  it('should return 400 if validation fails (e.g., negative quantity)', async () => {
    const invalidPayload = {
      productId: '123e4567-e89b-12d3-a456-426614174000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
      quantity: -1,
    };

    const response = await request(app)
      .post('/orders')
      .send(invalidPayload);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });
});