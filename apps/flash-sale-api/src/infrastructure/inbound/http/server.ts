import '../../config/load-env';
import 'reflect-metadata';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { CreateOrderUseCase } from '../../../application/use-cases/CreateOrderUseCase';
import { RedisService } from '../../cache/redis.service';
import { PostgresOrderRepository } from '../../outbound/PostgresOrderRepository';
import { AppModule } from './app.module';
import { OrderController } from './OrderController';
import { authMiddleware } from './middlewares/auth.middleware';

async function bootstrap(): Promise<void> {
  // Composition root: Nest levanta AppModule (AuthModule -> POST /auth/register, /auth/login).
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();

  // /orders sigue siendo un handler Express "puro". Se registra antes de app.init()
  // para quedar por delante del 404 handler de Nest, y reutiliza el RedisService del contenedor.
  const redisService = app.get(RedisService);
  const orderController = new OrderController(
    new CreateOrderUseCase(new PostgresOrderRepository()),
    redisService,
  );
  app
    .getHttpAdapter()
    .getInstance()
    .post('/orders', express.json(), authMiddleware, orderController.create);

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`🚀 Flash Sale API (NestJS) running with PostgreSQL & JWT Auth on port ${port}`);
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start Flash Sale API', error);
  process.exit(1);
});
