import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { RegisterUserUseCase } from '../../src/application/use-cases/RegisterUserUseCase';
import { User } from '../../src/domain/model/User';
import { AuthController } from '../../src/infrastructure/inbound/http/AuthController';
import { ScryptPasswordHasher } from '../../src/infrastructure/security/password-hasher';
import { IUserRepository } from '../../src/ports/outbound/IUserRepository';

class InMemoryUserRepository implements IUserRepository {
  readonly users: User[] = [];
  async save(user: User): Promise<void> {
    this.users.push(user);
  }
  async findByEmail(email: string): Promise<User | null> {
    return this.users.find((u) => u.email === email) ?? null;
  }
}

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

    const payload = jwt.verify(
      response.body.accessToken,
      process.env.JWT_SECRET || 'super_secret_key_flash_sale',
    ) as { userId: string; email: string };
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
