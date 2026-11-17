import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

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
}