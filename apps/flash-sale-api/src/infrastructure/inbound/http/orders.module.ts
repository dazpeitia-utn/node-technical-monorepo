import { Module } from '@nestjs/common';
import { CreateOrderUseCase } from '../../../application/use-cases/CreateOrderUseCase';
import { IOrderRepository } from '../../../ports/outbound/IOrderRepository';
import { ORDER_REPOSITORY } from '../../../ports/outbound/tokens';
import { PostgresOrderRepository } from '../../outbound/PostgresOrderRepository';
import { OrderController } from './OrderController';

// RedisService llega desde CacheModule (@Global).
@Module({
  controllers: [OrderController],
  providers: [
    { provide: ORDER_REPOSITORY, useClass: PostgresOrderRepository },
    {
      provide: CreateOrderUseCase,
      useFactory: (orderRepository: IOrderRepository) => new CreateOrderUseCase(orderRepository),
      inject: [ORDER_REPOSITORY],
    },
  ],
})
export class OrdersModule {}
