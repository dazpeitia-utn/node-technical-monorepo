import { signAccessToken } from '../../src/infrastructure/security/jwt';

export const PRODUCT_ID = '123e4567-e89b-12d3-a456-426614174000';
export const OTHER_PRODUCT_ID = '223e4567-e89b-12d3-a456-426614174000';
export const USER_ID = '123e4567-e89b-12d3-a456-426614174001';
export const OTHER_USER_ID = '223e4567-e89b-12d3-a456-426614174001';

/** Header `Authorization` con un JWT válido firmado con el secreto de test. */
export function bearer(userId = USER_ID, email = `${userId}@example.com`): string {
  return `Bearer ${signAccessToken({ userId, email })}`;
}
