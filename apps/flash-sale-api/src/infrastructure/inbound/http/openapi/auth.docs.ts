import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { loginSchema, registerUserSchema } from '../auth.schema';
import { errorSchema, zodToOpenApi } from './zod-openapi';

const EXAMPLE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJlYjM4M2Y4Yi00MWFmLTQ1YTktYTRiYi04YmQzYzQyOGQ3NGUiLCJlbWFpbCI6Impvcmdl…';

export const ApiAuth = () => ApiTags('auth');

export const ApiRegister = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Register a new user',
      description:
        'Validates the payload, hashes the password with scrypt, stores the user in PostgreSQL and returns a JWT access token (1h).',
    }),
    ApiBody({
      schema: zodToOpenApi(registerUserSchema, { email: 'jorge@example.com', password: 'super-secret' }),
    }),
    ApiResponse({
      status: 201,
      description: 'User created; returns the public profile and an access token.',
      schema: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string', format: 'email' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
          accessToken: { type: 'string' },
          tokenType: { type: 'string', enum: ['Bearer'] },
          expiresIn: { type: 'string' },
        },
        example: {
          message: 'User registered successfully',
          data: {
            id: 'eb383f8b-41af-45a9-a4bb-8bd3c428d74e',
            email: 'jorge@example.com',
            createdAt: '2026-11-17T17:11:57.350Z',
          },
          accessToken: EXAMPLE_TOKEN,
          tokenType: 'Bearer',
          expiresIn: '1h',
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'Invalid payload (field errors in `details`).',
      schema: errorSchema({
        error: 'Validation Error',
        details: {
          email: ['Invalid email format'],
          password: ['Password must be at least 8 characters'],
        },
      }),
    }),
    ApiResponse({
      status: 409,
      description: 'The email is already registered.',
      schema: errorSchema({ error: 'Email already registered' }),
    }),
  );

export const ApiLogin = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Get a development token',
      description:
        '⚠️ Development only: issues a JWT for the given email/userId **without verifying credentials**. Use `POST /auth/register` to get a token for a real user.',
    }),
    ApiBody({
      required: false,
      schema: zodToOpenApi(loginSchema, { email: 'jorge@example.com' }),
    }),
    ApiResponse({
      status: 200,
      description: 'Signed JWT access token (1h).',
      schema: {
        type: 'object',
        properties: { message: { type: 'string' }, token: { type: 'string' } },
        example: { message: 'Login successful', token: EXAMPLE_TOKEN },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'Invalid email or userId format.',
      schema: errorSchema({ error: 'Validation Error', details: { email: ['Invalid email format'] } }),
    }),
  );
