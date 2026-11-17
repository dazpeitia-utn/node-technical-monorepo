import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RedisService } from '../../src/infrastructure/cache/redis.service';

/**
 * Contra un Redis REAL (docker compose up -d redis). Verifica el SET NX EX y el script Lua
 * que los fakes no pueden probar. Se salta solo si no hay Redis disponible (p. ej. en CI sin el servicio).
 */
async function isRedisReachable(): Promise<boolean> {
  const probe = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    connectTimeout: 500,
  });
  probe.on('error', () => undefined);
  try {
    await probe.connect();
    return (await probe.ping()) === 'PONG';
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

describe('RedisService locks (real Redis)', () => {
  const redis = new RedisService();
  const prefix = `test:lock:${randomUUID()}`;
  let n = 0;
  let redisAvailable = false;
  const freshKey = () => `${prefix}:${n++}`;

  // Sin Redis: cada test se marca como "skipped" en lugar de fallar.
  beforeEach((ctx) => {
    if (!redisAvailable) ctx.skip();
  });

  beforeAll(async () => {
    redisAvailable = await isRedisReachable();
    // In CI (REQUIRE_REDIS=1) a missing Redis must fail the run instead of silently skipping these tests.
    if (!redisAvailable && process.env.REQUIRE_REDIS === '1') {
      throw new Error('REQUIRE_REDIS=1 but Redis is not reachable');
    }
    if (redisAvailable) redis.onModuleInit();
  });

  afterAll(async () => {
    if (redisAvailable) await redis.onModuleDestroy();
  });

  it('only one of 50 simultaneous acquireLock calls wins', async () => {
    const key = freshKey();

    const tokens = await Promise.all(Array.from({ length: 50 }, () => redis.acquireLock(key, 5)));

    expect(tokens.filter(Boolean)).toHaveLength(1);
  });

  it('sets the TTL on the lock', async () => {
    const key = freshKey();
    await redis.acquireLock(key, 3);

    const client = new Redis({ host: process.env.REDIS_HOST || 'localhost', port: Number(process.env.REDIS_PORT) || 6379 });
    const ttl = await client.ttl(key);
    await client.quit();

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(3);
  });

  it('releaseLock frees the lock only for its owner token', async () => {
    const key = freshKey();
    const token = await redis.acquireLock(key, 5);

    expect(await redis.releaseLock(key, 'someone-else')).toBe(false);
    expect(await redis.acquireLock(key, 5)).toBeNull();

    expect(await redis.releaseLock(key, token!)).toBe(true);
    expect(await redis.acquireLock(key, 5)).not.toBeNull();
  });
});
