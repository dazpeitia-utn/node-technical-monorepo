import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CreateOrderUseCase } from '../../src/application/use-cases/CreateOrderUseCase';
import { RedisService } from '../../src/infrastructure/cache/redis.service';
import { OrderController } from '../../src/infrastructure/inbound/http/OrderController';
import { IOrderRepository } from '../../src/ports/outbound/IOrderRepository';
import { FakeRedisService } from './FakeRedisService';

/**
 * Levanta una app Nest real con OrderController + JwtAuthGuard, sustituyendo
 * solo los adaptadores de salida (repositorio y Redis) por dobles en memoria.
 */
export async function createOrdersTestApp(deps: {
  orderRepository: IOrderRepository;
  redis: FakeRedisService;
}): Promise<INestApplication> {
  @Module({
    controllers: [OrderController],
    providers: [
      { provide: CreateOrderUseCase, useFactory: () => new CreateOrderUseCase(deps.orderRepository) },
      { provide: RedisService, useValue: deps.redis.asRedisService() },
    ],
  })
  class OrdersTestModule {}

  const app = await NestFactory.create(OrdersTestModule, { logger: false });
  await app.init();
  return app;
}
