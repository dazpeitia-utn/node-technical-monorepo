import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;

  onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
    });
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.quit();
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async del(key: string): Promise<number> {
    return await this.client.del(key);
  }

  /**
   * Toma un candado de forma atómica (`SET key token NX EX ttl`).
   * Devuelve el token del dueño si lo obtuvo, o `null` si ya estaba tomado.
   * A diferencia de GET + SET, dos llamadas simultáneas nunca pueden obtenerlo ambas.
   */
  async acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
    const token = randomUUID();
    const result = await this.client.set(key, token, 'EX', ttlSeconds, 'NX');
    return result === 'OK' ? token : null;
  }

  /**
   * Libera el candado solo si sigue siendo nuestro (compare-and-delete atómico en Lua),
   * para no borrar el candado de otra request si el nuestro ya expiró.
   */
  async releaseLock(key: string, token: string): Promise<boolean> {
    const deleted = await this.client.eval(RELEASE_LOCK_SCRIPT, 1, key, token);
    return deleted === 1;
  }
}

const RELEASE_LOCK_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;