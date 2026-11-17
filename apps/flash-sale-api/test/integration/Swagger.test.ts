import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CreateOrderUseCase } from '../../src/application/use-cases/CreateOrderUseCase';
import { GetOrderUseCase } from '../../src/application/use-cases/GetOrderUseCase';
import { RegisterUserUseCase } from '../../src/application/use-cases/RegisterUserUseCase';
import { RedisService } from '../../src/infrastructure/cache/redis.service';
import { AuthController } from '../../src/infrastructure/inbound/http/AuthController';
import { OrderController } from '../../src/infrastructure/inbound/http/OrderController';
import { setupSwagger } from '../../src/infrastructure/inbound/http/openapi/swagger';

// Solo se genera la documentación: los providers no se ejecutan.
@Module({
  controllers: [AuthController, OrderController],
  providers: [
    { provide: RegisterUserUseCase, useValue: {} },
    { provide: CreateOrderUseCase, useValue: {} },
    { provide: GetOrderUseCase, useValue: {} },
    { provide: RedisService, useValue: {} },
  ],
})
class DocsTestModule {}

describe('Swagger / OpenAPI docs', () => {
  let app: INestApplication;
  let spec: any;

  beforeAll(async () => {
    app = await NestFactory.create(DocsTestModule, { logger: false });
    setupSwagger(app);
    await app.init();
    spec = (await request(app.getHttpServer()).get('/api/docs-json')).body;
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves the Swagger UI at /api/docs', async () => {
    const response = await request(app.getHttpServer()).get('/api/docs/');
    expect(response.status).toBe(200);
    expect(response.text).toContain('swagger-ui');
  });

  it('documents every endpoint with its responses', () => {
    expect(Object.keys(spec.paths['/auth/register'].post.responses)).toEqual(
      expect.arrayContaining(['201', '400', '409']),
    );
    expect(Object.keys(spec.paths['/auth/login'].post.responses)).toEqual(
      expect.arrayContaining(['200', '400']),
    );
    expect(Object.keys(spec.paths['/orders'].post.responses)).toEqual(
      expect.arrayContaining(['202', '400', '401', '429']),
    );
    expect(Object.keys(spec.paths['/orders/{id}'].get.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '404']),
    );
    expect(spec.paths['/orders'].post.responses['202'].headers).toHaveProperty('Location');
  });

  it('builds request bodies from the Zod schemas', () => {
    const registerBody = spec.paths['/auth/register'].post.requestBody.content['application/json'].schema;
    expect(registerBody.required).toEqual(['email', 'password']);
    expect(registerBody.properties.email.format).toBe('email');
    expect(registerBody.properties.password).toMatchObject({ minLength: 8, maxLength: 72 });

    const orderBody = spec.paths['/orders'].post.requestBody.content['application/json'].schema;
    expect(orderBody.properties.productId.format).toBe('uuid');
    expect(orderBody.properties.quantity.type).toBe('integer');
  });

  it('marks /orders as protected by a Bearer JWT, and /auth as public', () => {
    expect(spec.components.securitySchemes.bearer).toMatchObject({ type: 'http', scheme: 'bearer' });
    expect(spec.paths['/orders'].post.security).toEqual([{ bearer: [] }]);
    expect(spec.paths['/orders/{id}'].get.security).toEqual([{ bearer: [] }]);
    expect(spec.paths['/auth/register'].post.security).toBeUndefined();
  });
});
