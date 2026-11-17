import { describe, expect, it } from 'vitest';
import { createOrderSchema } from '../../src/infrastructure/inbound/http/order.schema';
import { PRODUCT_ID } from '../helpers/fixtures';

const fieldErrors = (input: unknown) => {
  const result = createOrderSchema.safeParse(input);
  return result.success ? {} : result.error.flatten().fieldErrors;
};

describe('createOrderSchema', () => {
  it('accepts a valid payload', () => {
    expect(createOrderSchema.parse({ productId: PRODUCT_ID, quantity: 3 })).toEqual({
      productId: PRODUCT_ID,
      quantity: 3,
    });
  });

  it('strips unknown fields such as a client-supplied userId', () => {
    const parsed = createOrderSchema.parse({ productId: PRODUCT_ID, quantity: 1, userId: 'spoofed' });

    expect(parsed).not.toHaveProperty('userId');
  });

  it.each([
    ['missing productId', { quantity: 1 }, 'productId'],
    ['productId that is not a UUID', { productId: 'abc', quantity: 1 }, 'productId'],
    ['missing quantity', { productId: PRODUCT_ID }, 'quantity'],
    ['zero quantity', { productId: PRODUCT_ID, quantity: 0 }, 'quantity'],
    ['negative quantity', { productId: PRODUCT_ID, quantity: -2 }, 'quantity'],
    ['decimal quantity', { productId: PRODUCT_ID, quantity: 1.5 }, 'quantity'],
    ['quantity sent as string', { productId: PRODUCT_ID, quantity: '2' }, 'quantity'],
  ])('rejects %s', (_case, input, field) => {
    expect(fieldErrors(input)).toHaveProperty(field);
  });

  it('uses readable messages', () => {
    expect(fieldErrors({ productId: 'abc', quantity: 0 })).toEqual({
      productId: ['Invalid product ID format'],
      quantity: ['Quantity must be a positive integer'],
    });
  });
});
