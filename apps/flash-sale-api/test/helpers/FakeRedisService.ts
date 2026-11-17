import { RedisService } from '../../src/infrastructure/cache/redis.service';

/**
 * Redis en memoria con TTL basado en Date.now(), así funciona con `vi.useFakeTimers()`.
 * Implementa la misma API pública que RedisService (get/set/del).
 */
export class FakeRedisService {
  private readonly store = new Map<string, { value: string; expiresAt: number | null }>();
  readonly setCalls: Array<{ key: string; value: string; ttlSeconds?: number }> = [];

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.setCalls.push({ key, value, ttlSeconds });
    this.store.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
  }

  async del(key: string): Promise<number> {
    return Number(this.store.delete(key));
  }

  clear(): void {
    this.store.clear();
    this.setCalls.length = 0;
  }

  /** Para inyectarlo donde se espera un RedisService. */
  asRedisService(): RedisService {
    return this as unknown as RedisService;
  }
}
