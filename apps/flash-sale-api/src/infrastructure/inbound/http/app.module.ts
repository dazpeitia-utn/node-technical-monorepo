import { Module } from '@nestjs/common';
import { CacheModule } from '../../cache/cache.module';
import { AuthModule } from './auth.module';

@Module({
  imports: [CacheModule, AuthModule],
})
export class AppModule {}
