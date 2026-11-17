import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import { createOrderSchema } from '../order.schema';
import { BEARER_AUTH } from './swagger';
import { errorSchema, zodToOpenApi } from './zod-openapi';

const ORDER_ID = 'cf0f0bab-dd8c-4aa2-a01f-8c80b0249ee2';

const orderSchema: SchemaObject = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    productId: { type: 'string', format: 'uuid' },
    userId: { type: 'string', format: 'uuid' },
    quantity: { type: 'integer' },
    status: {
      type: 'string',
      enum: ['PENDING', 'CONFIRMED', 'REJECTED'],
      description: 'PENDING while queued/processing, then CONFIRMED, or REJECTED if processing failed after all retries.',
    },
  },
};

const exampleOrder = (status: string) => ({
  id: ORDER_ID,
  productId: '123e4567-e89b-12d3-a456-426614174000',
  userId: 'fff40f42-d94e-4d34-97e0-c73d24dbcc86',
  quantity: 2,
  status,
});

const unauthorized = ApiResponse({
  status: 401,
  description: 'Missing, malformed, invalid or expired Bearer token.',
  schema: errorSchema({ error: 'Invalid or expired token' }),
});

export const ApiOrders = () => applyDecorators(ApiTags('orders'), ApiBearerAuth(BEARER_AUTH));

export const ApiCreateOrder = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Place an order (asynchronous)',
      description:
        'Requires `Authorization: Bearer <JWT>`. The `userId` is taken from the token, never from the body. ' +
        'A Redis lock rejects repeated orders for the same user and product for 3 seconds.\n\n' +
        'The order is **queued** (BullMQ) and the response comes back immediately with `202 Accepted` and status `PENDING`; ' +
        'a background worker persists it and sets the final status. Poll `GET /orders/{id}` (also in the `Location` header) to follow it.',
    }),
    ApiBody({
      schema: zodToOpenApi(createOrderSchema, {
        productId: '123e4567-e89b-12d3-a456-426614174000',
        quantity: 2,
      }),
    }),
    ApiResponse({
      status: 202,
      description: 'Order accepted and queued with status PENDING.',
      headers: { Location: { description: 'URL to check the order status', schema: { type: 'string', example: `/orders/${ORDER_ID}` } } },
      schema: {
        type: 'object',
        properties: { message: { type: 'string' }, data: orderSchema },
        example: { message: 'Order accepted for processing', data: exampleOrder('PENDING') },
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
    unauthorized,
    ApiResponse({
      status: 429,
      description: 'An order for this product is already being processed for this user (Redis lock, 3s).',
      schema: errorSchema({
        error: 'Too Many Requests',
        message: 'Ya tienes una orden en proceso para este producto. Por favor espera unos segundos.',
      }),
    }),
  );

export const ApiGetOrder = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Get an order and its status',
      description:
        'Returns one of your orders, whether it is still queued (`PENDING`) or already processed (`CONFIRMED` / `REJECTED`). ' +
        'Orders that belong to other users answer `404`.',
    }),
    ApiParam({ name: 'id', format: 'uuid', example: ORDER_ID }),
    ApiResponse({
      status: 200,
      description: 'The order.',
      schema: {
        type: 'object',
        properties: { data: orderSchema },
        example: { data: exampleOrder('CONFIRMED') },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'The id is not a UUID.',
      schema: errorSchema({ error: 'Validation Error', details: { id: ['Invalid order ID format'] } }),
    }),
    unauthorized,
    ApiResponse({
      status: 404,
      description: 'No such order, or it belongs to another user.',
      schema: errorSchema({ error: 'Order not found' }),
    }),
  );
