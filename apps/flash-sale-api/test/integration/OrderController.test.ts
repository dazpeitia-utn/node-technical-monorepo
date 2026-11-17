import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { InMemoryOrderRepository } from '../../src/infrastructure/outbound/InMemoryOrderRepository';
import { createOrdersTestApp } from '../helpers/createOrdersTestApp';
import { FakeRedisService } from '../helpers/FakeRedisService';
import { OTHER_PRODUCT_ID, OTHER_USER_ID, PRODUCT_ID, USER_ID, bearer } from '../helpers/fixtures';

const validPayload = { productId: PRODUCT_ID, quantity: 3 };

describe('POST /orders (Integration Test, NestJS + Supertest)', () => {
  const redis = new FakeRedisService();
  const orderRepository = new InMemoryOrderRepository();
  let app: INestApplication;

  const postOrder = (body: object = validPayload, authorization: string | null = bearer()) => {
    const req = request(app.getHttpServer()).post('/orders');
    if (authorization) req.set('Authorization', authorization);
    return req.send(body);
  };

  beforeAll(async () => {
    app = await createOrdersTestApp({ orderRepository, redis });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => redis.clear());

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('201 Created', () => {
    it('creates a PENDING order and persists it', async () => {
      const response = await postOrder();

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Order created successfully');
      expect(response.body.data).toMatchObject({ productId: PRODUCT_ID, quantity: 3, status: 'PENDING' });
      expect(await orderRepository.findById(response.body.data.id)).not.toBeNull();
    });

    it('takes the userId from the JWT and ignores one sent in the body', async () => {
      const response = await postOrder({ ...validPayload, userId: OTHER_USER_ID }, bearer(USER_ID));

      expect(response.status).toBe(201);
      expect(response.body.data.userId).toBe(USER_ID);
    });
  });

  describe('Redis concurrency lock (429 Too Many Requests)', () => {
    it('blocks a repeated order from the same user for the same product', async () => {
      expect((await postOrder()).status).toBe(201);

      const second = await postOrder();

      expect(second.status).toBe(429);
      expect(second.body).toEqual({
        error: 'Too Many Requests',
        message: 'Ya tienes una orden en proceso para este producto. Por favor espera unos segundos.',
      });
    });

    it('does not create a second order when blocked', async () => {
      const save = vi.spyOn(orderRepository, 'save');

      await postOrder();
      await postOrder();

      expect(save).toHaveBeenCalledTimes(1);
    });

    it('sets the lock per user and product with a 3 second TTL', async () => {
      await postOrder();

      expect(redis.setCalls).toEqual([
        { key: `lock:order:${USER_ID}:${PRODUCT_ID}`, value: 'locked', ttlSeconds: 3 },
      ]);
    });

    it('does not block the same user ordering a different product', async () => {
      expect((await postOrder()).status).toBe(201);
      expect((await postOrder({ ...validPayload, productId: OTHER_PRODUCT_ID })).status).toBe(201);
    });

    it('does not block a different user ordering the same product', async () => {
      expect((await postOrder(validPayload, bearer(USER_ID))).status).toBe(201);
      expect((await postOrder(validPayload, bearer(OTHER_USER_ID))).status).toBe(201);
    });

    it('allows the order again once the lock expires', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });

      expect((await postOrder()).status).toBe(201);
      vi.advanceTimersByTime(2_999);
      expect((await postOrder()).status).toBe(429);
      vi.advanceTimersByTime(1);
      expect((await postOrder()).status).toBe(201);
    });
  });

  describe('400 Bad Request', () => {
    it.each([
      ['negative quantity', { productId: PRODUCT_ID, quantity: -1 }, 'quantity'],
      ['quantity as string', { productId: PRODUCT_ID, quantity: '3' }, 'quantity'],
      ['invalid productId', { productId: 'abc', quantity: 1 }, 'productId'],
      ['empty body', {}, 'productId'],
    ])('rejects %s with field errors', async (_case, body, field) => {
      const response = await postOrder(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation Error');
      expect(response.body.details).toHaveProperty(field);
    });

    it('does not take the Redis lock for an invalid payload', async () => {
      await postOrder({ productId: PRODUCT_ID, quantity: 0 });

      expect(redis.setCalls).toHaveLength(0);
    });
  });

  describe('401 Unauthorized', () => {
    it('rejects a request without a token', async () => {
      const response = await postOrder(validPayload, null);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Access token missing or malformed');
    });

    it('rejects an invalid token', async () => {
      const response = await postOrder(validPayload, 'Bearer not-a-jwt');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid or expired token');
    });

    it('authenticates before validating (no token + bad body → 401, not 400)', async () => {
      expect((await postOrder({}, null)).status).toBe(401);
    });
  });

  describe('500 Internal Server Error', () => {
    it('does not leak internal error details when persistence fails', async () => {
      vi.spyOn(orderRepository, 'save').mockRejectedValueOnce(new Error('connection to db lost'));

      const response = await postOrder();

      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('connection to db lost');
    });
  });
});
