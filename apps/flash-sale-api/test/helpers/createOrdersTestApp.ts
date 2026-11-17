import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CreateOrderUseCase } from '../../src/application/use-cases/CreateOrderUseCase';
import { GetOrderUseCase } from '../../src/application/use-cases/GetOrderUseCase';
import { RedisService } from '../../src/infrastructure/cache/redis.service';
import { OrderController } from '../../src/infrastructure/inbound/http/OrderController';
import { IOrderQueue } from '../../src/ports/outbound/IOrderQueue';
import { IOrderRepository } from '../../src/ports/outbound/IOrderRepository';
import { FakeRedisService } from './FakeRedisService';

/**
 * Levanta una app Nest real con OrderController + JwtAuthGuard, sustituyendo
 * solo los adaptadores de salida (cola, repositorio y Redis) por dobles en memoria.
 */
export async function createOrdersTestApp(deps: {
  orderQueue: IOrderQueue;
  orderRepository: IOrderRepository;
  redis: FakeRedisService;
}): Promise<INestApplication> {
  @Module({
    controllers: [OrderController],
    providers: [
      { provide: CreateOrderUseCase, useFactory: () => new CreateOrderUseCase(deps.orderQueue) },
      { provide: GetOrderUseCase, useFactory: () => new GetOrderUseCase(deps.orderRepository, deps.orderQueue) },
      { provide: RedisService, useValue: deps.redis.asRedisService() },
    ],
  })
  class OrdersTestModule {}

  const app = await NestFactory.create(OrdersTestModule, { logger: false });
  await app.init();
  return app;
}
