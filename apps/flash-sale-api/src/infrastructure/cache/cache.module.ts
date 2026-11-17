import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

@Global() // Opcional: lo hace global para que no tengas que importarlo en cada módulo
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class CacheModule {}