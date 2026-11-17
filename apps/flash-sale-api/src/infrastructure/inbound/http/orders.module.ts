import { Module } from '@nestjs/common';
import { CreateOrderUseCase } from '../../../application/use-cases/CreateOrderUseCase';
import { GetOrderUseCase } from '../../../application/use-cases/GetOrderUseCase';
import { IOrderQueue } from '../../../ports/outbound/IOrderQueue';
import { IOrderRepository } from '../../../ports/outbound/IOrderRepository';
import { ORDER_QUEUE, ORDER_REPOSITORY } from '../../../ports/outbound/tokens';
import { BullMqOrderQueue } from '../../outbound/BullMqOrderQueue';
import { PostgresOrderRepository } from '../../outbound/PostgresOrderRepository';
import { OrderController } from './OrderController';

// RedisService (candado) llega desde CacheModule (@Global). El procesamiento de las órdenes
// vive en otro proceso: WorkerModule (src/infrastructure/inbound/queue).
@Module({
  controllers: [OrderController],
  providers: [
    { provide: ORDER_QUEUE, useFactory: () => new BullMqOrderQueue() },
    { provide: ORDER_REPOSITORY, useClass: PostgresOrderRepository },
    {
      provide: CreateOrderUseCase,
      useFactory: (orderQueue: IOrderQueue) => new CreateOrderUseCase(orderQueue),
      inject: [ORDER_QUEUE],
    },
    {
      provide: GetOrderUseCase,
      useFactory: (orderRepository: IOrderRepository, orderQueue: IOrderQueue) =>
        new GetOrderUseCase(orderRepository, orderQueue),
      inject: [ORDER_REPOSITORY, ORDER_QUEUE],
    },
  ],
})
export class OrdersModule {}
