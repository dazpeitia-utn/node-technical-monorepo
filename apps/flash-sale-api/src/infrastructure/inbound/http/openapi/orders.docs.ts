import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { createOrderSchema } from '../order.schema';
import { BEARER_AUTH } from './swagger';
import { errorSchema, zodToOpenApi } from './zod-openapi';

export const ApiOrders = () => applyDecorators(ApiTags('orders'), ApiBearerAuth(BEARER_AUTH));

export const ApiCreateOrder = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Create an order',
      description:
        'Requires `Authorization: Bearer <JWT>`. The `userId` is taken from the token, never from the body. ' +
        'A Redis lock rejects repeated orders for the same user and product for 3 seconds.',
    }),
    ApiBody({
      schema: zodToOpenApi(createOrderSchema, {
        productId: '123e4567-e89b-12d3-a456-426614174000',
        quantity: 2,
      }),
    }),
    ApiResponse({
      status: 201,
      description: 'Order created with status PENDING.',
      schema: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          data: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              productId: { type: 'string', format: 'uuid' },
              userId: { type: 'string', format: 'uuid' },
              quantity: { type: 'integer' },
              status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'REJECTED'] },
            },
          },
        },
        example: {
          message: 'Order created successfully',
          data: {
            id: 'cf0f0bab-dd8c-4aa2-a01f-8c80b0249ee2',
            productId: '123e4567-e89b-12d3-a456-426614174000',
            userId: 'fff40f42-d94e-4d34-97e0-c73d24dbcc86',
            quantity: 2,
            status: 'PENDING',
          },
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'Invalid payload (field errors in `details`).',
      schema: errorSchema({
        error: 'Validation Error',
        details: { quantity: ['Quantity must be a positive integer'] },
      }),
    }),
    ApiResponse({
      status: 401,
      description: 'Missing, malformed, invalid or expired Bearer token.',
      schema: errorSchema({ error: 'Invalid or expired token' }),
    }),
    ApiResponse({
      status: 429,
      description: 'An order for this product is already being processed for this user (Redis lock, 3s).',
      schema: errorSchema({
        error: 'Too Many Requests',
        message: 'Ya tienes una orden en proceso para este producto. Por favor espera unos segundos.',
      }),
    }),
  );
