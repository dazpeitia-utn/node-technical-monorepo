import { describe, expect, it } from 'vitest';
import { Order } from '../../src/domain/model/Order';
import { OTHER_USER_ID, PRODUCT_ID, USER_ID } from '../helpers/fixtures';

describe('Order (domain)', () => {
  const pending = () => Order.create(PRODUCT_ID, USER_ID, 1);

  it('starts PENDING', () => {
    expect(pending().status).toBe('PENDING');
    expect(pending().isFinal()).toBe(false);
  });

  it('confirm() and reject() return a new order with the final status', () => {
    const order = pending();

    expect(order.confirm()).toMatchObject({ id: order.id, status: 'CONFIRMED' });
    expect(order.reject()).toMatchObject({ id: order.id, status: 'REJECTED' });
    expect(order.status).toBe('PENDING'); // immutable
  });

  it('does not allow changing a final status', () => {
    expect(() => pending().confirm().reject()).toThrow(/already CONFIRMED/);
    expect(() => pending().reject().confirm()).toThrow(/already REJECTED/);
  });

  it('knows its owner', () => {
    expect(pending().belongsTo(USER_ID)).toBe(true);
    expect(pending().belongsTo(OTHER_USER_ID)).toBe(false);
  });
});
