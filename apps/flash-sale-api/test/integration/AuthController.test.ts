import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { RegisterUserUseCase } from '../../src/application/use-cases/RegisterUserUseCase';
import { AuthController } from '../../src/infrastructure/inbound/http/AuthController';
import { verifyAccessToken } from '../../src/infrastructure/security/jwt';
import { ScryptPasswordHasher } from '../../src/infrastructure/security/password-hasher';
import { InMemoryUserRepository } from '../helpers/InMemoryUserRepository';

const userRepository = new InMemoryUserRepository();

@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: RegisterUserUseCase,
      useFactory: () => new RegisterUserUseCase(userRepository, new ScryptPasswordHasher()),
    },
  ],
})
class TestAuthModule {}

describe('POST /auth/register (Integration Test, NestJS)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(TestAuthModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a user and returns a valid JWT access token', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'Grace@Example.com', password: 'super-secret' });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('User registered successfully');
    expect(response.body.data).toMatchObject({ email: 'grace@example.com' });
    expect(response.body.data).not.toHaveProperty('passwordHash');
    expect(response.body.tokenType).toBe('Bearer');

    const payload = verifyAccessToken(response.body.accessToken);
    expect(payload.userId).toBe(response.body.data.id);
    expect(payload.email).toBe('grace@example.com');

    expect(userRepository.users[0].passwordHash).not.toContain('super-secret');
  });

  it('returns 409 when the email is already registered', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'grace@example.com', password: 'other-secret' });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Email already registered');
  });

  it('returns 400 with field errors for an invalid payload', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: '123' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation Error');
    expect(response.body.details).toHaveProperty('email');
    expect(response.body.details).toHaveProperty('password');
  });
});

describe('POST /auth/login (Integration Test, NestJS)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await NestFactory.create(TestAuthModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('issues a development token for the given email and userId', async () => {
    const userId = '323e4567-e89b-12d3-a456-426614174001';
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'jorge@example.com', userId });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Login successful');
    expect(verifyAccessToken(response.body.token)).toEqual({ userId, email: 'jorge@example.com' });
  });

  it('falls back to the default test user with an empty body', async () => {
    const response = await request(app.getHttpServer()).post('/auth/login');

    expect(response.status).toBe(200);
    expect(verifyAccessToken(response.body.token)).toEqual({
      userId: '123e4567-e89b-12d3-a456-426614174001',
      email: 'user@example.com',
    });
  });

  it('returns 400 for a malformed email or userId', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'bad', userId: 'nope' });

    expect(response.status).toBe(400);
    expect(Object.keys(response.body.details)).toEqual(['email', 'userId']);
  });
});
