import { z } from 'zod';

export const createOrderSchema = z.object({
  productId: z.string().uuid({ message: 'Invalid product ID format' }),
  userId: z.string().uuid({ message: 'Invalid user ID format' }),
  quantity: z.number().int().positive({ message: 'Quantity must be a positive integer' }),
});

export type CreateOrderDTO = z.infer<typeof createOrderSchema>;