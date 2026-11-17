import { type RedisService } from '../../src/infrastructure/cache/redis.service';

/**
 * Redis en memoria con TTL basado en Date.now(), así funciona con `vi.useFakeTimers()`.
 * Implementa la misma API pública que RedisService. `acquireLock` es atómico como `SET NX`:
 * la comprobación y la escritura ocurren en el mismo tick, sin `await` en el medio.
 */
export class FakeRedisService {
  private readonly store = new Map<string, { value: string; expiresAt: number | null }>();
  private nextToken = 1;
  readonly lockCalls: Array<{ key: string; ttlSeconds: number; acquired: boolean }> = [];
  readonly releaseCalls: Array<{ key: string; released: boolean }> = [];

  async get(key: string): Promise<string | null> {
    return this.read(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.write(key, value, ttlSeconds);
  }

  async del(key: string): Promise<number> {
    return Number(this.store.delete(key));
  }

  async acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
    const acquired = this.read(key) === null;
    this.lockCalls.push({ key, ttlSeconds, acquired });
    if (!acquired) return null;

    const token = `token-${this.nextToken++}`;
    this.write(key, token, ttlSeconds);
    return token;
  }

  async releaseLock(key: string, token: string): Promise<boolean> {
    const released = this.read(key) === token;
    if (released) this.store.delete(key);
    this.releaseCalls.push({ key, released });
    return released;
  }

  clear(): void {
    this.store.clear();
    this.lockCalls.length = 0;
    this.releaseCalls.length = 0;
  }

  /** Para inyectarlo donde se espera un RedisService. */
  asRedisService(): RedisService {
    return this as unknown as RedisService;
  }

  private read(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  private write(key: string, value: string, ttlSeconds?: number): void {
    this.store.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
  }
}
