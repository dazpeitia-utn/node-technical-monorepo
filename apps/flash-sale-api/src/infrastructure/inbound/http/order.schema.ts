import { z } from 'zod';

export const createOrderSchema = z.object({
  productId: z.string().uuid({ message: 'Invalid product ID format' }).describe('Product UUID'),
  quantity: z
    .number()
    .int()
    .positive({ message: 'Quantity must be a positive integer' })
    .describe('Units to order (positive integer)'),
});

export type CreateOrderDTO = z.infer<typeof createOrderSchema>;

export const orderIdSchema = z.string().uuid().describe('Order UUID (returned by POST /orders)');
