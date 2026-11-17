import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { ProcessOrderUseCase } from '../../src/application/use-cases/ProcessOrderUseCase';
import { InMemoryOrderRepository } from '../../src/infrastructure/outbound/InMemoryOrderRepository';
import { createOrdersTestApp } from '../helpers/createOrdersTestApp';
import { FakeRedisService } from '../helpers/FakeRedisService';
import { InMemoryOrderQueue } from '../helpers/InMemoryOrderQueue';
import { OTHER_PRODUCT_ID, OTHER_USER_ID, PRODUCT_ID, USER_ID, bearer } from '../helpers/fixtures';

const validPayload = { productId: PRODUCT_ID, quantity: 3 };

describe('Orders API (Integration Test, NestJS + Supertest)', () => {
  const redis = new FakeRedisService();
  const orderQueue = new InMemoryOrderQueue();
  const orderRepository = new InMemoryOrderRepository();
  const runWorker = () => orderQueue.drain(new ProcessOrderUseCase(orderRepository));
  let app: INestApplication;

  const postOrder = (body: object = validPayload, authorization: string | null = bearer()) => {
    const req = request(app.getHttpServer()).post('/orders');
    if (authorization) req.set('Authorization', authorization);
    return req.send(body);
  };

  const getOrder = (id: string, authorization: string | null = bearer()) => {
    const req = request(app.getHttpServer()).get(`/orders/${id}`);
    if (authorization) req.set('Authorization', authorization);
    return req;
  };

  beforeAll(async () => {
    app = await createOrdersTestApp({ orderQueue, orderRepository, redis });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    redis.clear();
    orderQueue.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('POST /orders → 202 Accepted (queued, non-blocking)', () => {
    it('answers 202 with a PENDING order and a Location header', async () => {
      const response = await postOrder();

      expect(response.status).toBe(202);
      expect(response.body.message).toBe('Order accepted for processing');
      expect(response.body.data).toMatchObject({ productId: PRODUCT_ID, quantity: 3, status: 'PENDING' });
      expect(response.headers.location).toBe(`/orders/${response.body.data.id}`);
    });

    it('enqueues the order and does NOT touch the database in the request', async () => {
      const save = vi.spyOn(orderRepository, 'save');

      const response = await postOrder();

      expect(orderQueue.waiting().map((j) => j.orderId)).toEqual([response.body.data.id]);
      expect(save).not.toHaveBeenCalled();
    });

    it('takes the userId from the JWT and ignores one sent in the body', async () => {
      const response = await postOrder({ ...validPayload, userId: OTHER_USER_ID }, bearer(USER_ID));

      expect(response.status).toBe(202);
      expect(response.body.data.userId).toBe(USER_ID);
      expect(orderQueue.waiting()[0].userId).toBe(USER_ID);
    });
  });

  describe('Redis concurrency lock (429 Too Many Requests)', () => {
    it('blocks a repeated order from the same user for the same product', async () => {
      expect((await postOrder()).status).toBe(202);

      const second = await postOrder();

      expect(second.status).toBe(429);
      expect(second.body).toEqual({
        error: 'Too Many Requests',
        message: 'Ya tienes una orden en proceso para este producto. Por favor espera unos segundos.',
      });
    });

    it('does not enqueue a second order when blocked', async () => {
      await postOrder();
      await postOrder();

      expect(orderQueue.enqueueCalls).toBe(1);
    });

    it('sets the lock per user and product with a 3 second TTL', async () => {
      await postOrder();

      expect(redis.lockCalls).toEqual([
        { key: `lock:order:${USER_ID}:${PRODUCT_ID}`, ttlSeconds: 3, acquired: true },
      ]);
    });

    it('does not block the same user ordering a different product', async () => {
      expect((await postOrder()).status).toBe(202);
      expect((await postOrder({ ...validPayload, productId: OTHER_PRODUCT_ID })).status).toBe(202);
    });

    it('does not block a different user ordering the same product', async () => {
      expect((await postOrder(validPayload, bearer(USER_ID))).status).toBe(202);
      expect((await postOrder(validPayload, bearer(OTHER_USER_ID))).status).toBe(202);
    });

    it('allows the order again once the lock expires', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });

      expect((await postOrder()).status).toBe(202);
      vi.advanceTimersByTime(2_999);
      expect((await postOrder()).status).toBe(429);
      vi.advanceTimersByTime(1);
      expect((await postOrder()).status).toBe(202);
    });
  });

  describe('POST /orders → 400 Bad Request', () => {
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

    it('does not take the Redis lock nor enqueue for an invalid payload', async () => {
      await postOrder({ productId: PRODUCT_ID, quantity: 0 });

      expect(redis.lockCalls).toHaveLength(0);
      expect(orderQueue.enqueueCalls).toBe(0);
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

    it('protects GET /orders/:id too', async () => {
      expect((await getOrder(PRODUCT_ID, null)).status).toBe(401);
    });
  });

  describe('POST /orders → 500 when the queue is down', () => {
    it('does not leak internal error details', async () => {
      vi.spyOn(orderQueue, 'enqueue').mockRejectedValueOnce(new Error('connection to redis lost'));

      const response = await postOrder();

      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('connection to redis lost');
    });

    it('releases the Redis lock so an immediate retry succeeds', async () => {
      vi.spyOn(orderQueue, 'enqueue').mockRejectedValueOnce(new Error('connection to redis lost'));

      expect((await postOrder()).status).toBe(500);
      expect((await postOrder()).status).toBe(202);
    });
  });

  describe('GET /orders/:id (status polling)', () => {
    it('follows the order from PENDING (queued) to CONFIRMED (processed by the worker)', async () => {
      const { headers } = await postOrder();

      const queued = await request(app.getHttpServer()).get(headers.location).set('Authorization', bearer());
      expect(queued.status).toBe(200);
      expect(queued.body.data.status).toBe('PENDING');

      await runWorker();

      const processed = await request(app.getHttpServer()).get(headers.location).set('Authorization', bearer());
      expect(processed.body.data).toMatchObject({ productId: PRODUCT_ID, quantity: 3, userId: USER_ID, status: 'CONFIRMED' });
    });

    it('reports REJECTED when processing failed for good', async () => {
      const { body } = await postOrder();
      orderQueue.markFailed(body.data.id);

      expect((await getOrder(body.data.id)).body.data.status).toBe('REJECTED');
    });

    it("answers 404 for another user's order", async () => {
      const { body } = await postOrder(validPayload, bearer(USER_ID));

      const response = await getOrder(body.data.id, bearer(OTHER_USER_ID));

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Order not found' });
    });

    it('answers 404 for an unknown id', async () => {
      expect((await getOrder('00000000-0000-4000-8000-000000000000')).status).toBe(404);
    });

    it('answers 400 for an id that is not a UUID', async () => {
      const response = await getOrder('not-a-uuid');

      expect(response.status).toBe(400);
      expect(response.body.details).toEqual({ id: ['Invalid order ID format'] });
    });
  });
});
