import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CreateOrderUseCase } from '../../src/application/use-cases/CreateOrderUseCase';
import { RedisService } from '../../src/infrastructure/cache/redis.service';
import { OrderController } from '../../src/infrastructure/inbound/http/OrderController';
import { InMemoryOrderRepository } from '../../src/infrastructure/outbound/InMemoryOrderRepository';
import { signAccessToken } from '../../src/infrastructure/security/jwt';

// Redis falso en memoria (sin TTL real): suficiente para probar el bloqueo.
const redisStore = new Map<string, string>();
const fakeRedis = {
  get: async (key: string) => redisStore.get(key) ?? null,
  set: async (key: string, value: string) => void redisStore.set(key, value),
  del: async (key: string) => Number(redisStore.delete(key)),
} as unknown as RedisService;

@Module({
  controllers: [OrderController],
  providers: [
    { provide: CreateOrderUseCase, useFactory: () => new CreateOrderUseCase(new InMemoryOrderRepository()) },
    { provide: RedisService, useValue: fakeRedis },
  ],
})
class TestOrdersModule {}

const USER_ID = '123e4567-e89b-12d3-a456-426614174001';
const token = signAccessToken({ userId: USER_ID, email: 'user@example.com' });
const validPayload = { productId: '123e4567-e89b-12d3-a456-426614174000', quantity: 3 };

describe('POST /orders (Integration Test, NestJS)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(TestOrdersModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => redisStore.clear());

  it('creates an order using the userId from the JWT', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload, userId: 'spoofed-user-id' });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('Order created successfully');
    expect(response.body.data).toHaveProperty('id');
    expect(response.body.data.status).toBe('PENDING');
    expect(response.body.data.userId).toBe(USER_ID);
  });

  it('returns 400 if validation fails (e.g., negative quantity)', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validPayload, quantity: -1 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation Error');
    expect(response.body.details).toHaveProperty('quantity');
  });

  it('returns 401 without a Bearer token', async () => {
    const response = await request(app.getHttpServer()).post('/orders').send(validPayload);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Access token missing or malformed');
  });

  it('returns 401 with an invalid token', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', 'Bearer not-a-jwt')
      .send(validPayload);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Invalid or expired token');
  });

  it('returns 429 when the same user repeats the order for the same product', async () => {
    const send = () =>
      request(app.getHttpServer())
        .post('/orders')
        .set('Authorization', `Bearer ${token}`)
        .send(validPayload);

    expect((await send()).status).toBe(201);
    const second = await send();
    expect(second.status).toBe(429);
    expect(second.body.error).toBe('Too Many Requests');
  });
});
