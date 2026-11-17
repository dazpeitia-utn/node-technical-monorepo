import { Module } from '@nestjs/common';
import { CacheModule } from '../../cache/cache.module';
import { AuthModule } from './auth.module';
import { OrdersModule } from './orders.module';

@Module({
  imports: [CacheModule, AuthModule, OrdersModule],
})
export class AppModule {}
