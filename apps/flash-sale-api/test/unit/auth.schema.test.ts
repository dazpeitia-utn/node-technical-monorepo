import { describe, expect, it } from 'vitest';
import { loginSchema, registerUserSchema } from '../../src/infrastructure/inbound/http/auth.schema';

describe('registerUserSchema', () => {
  it('trims and lowercases the email', () => {
    expect(registerUserSchema.parse({ email: '  Ada@Example.COM ', password: 'super-secret' })).toEqual({
      email: 'ada@example.com',
      password: 'super-secret',
    });
  });

  it.each([
    ['invalid email', { email: 'nope', password: 'super-secret' }, 'email'],
    ['missing email', { password: 'super-secret' }, 'email'],
    ['password shorter than 8', { email: 'a@b.com', password: '1234567' }, 'password'],
    ['password longer than 72', { email: 'a@b.com', password: 'x'.repeat(73) }, 'password'],
    ['missing password', { email: 'a@b.com' }, 'password'],
  ])('rejects %s', (_case, input, field) => {
    const result = registerUserSchema.safeParse(input);

    expect(result.success).toBe(false);
    expect(result.success ? {} : result.error.flatten().fieldErrors).toHaveProperty(field);
  });

  it('accepts the 8 and 72 character boundaries', () => {
    expect(registerUserSchema.safeParse({ email: 'a@b.com', password: 'x'.repeat(8) }).success).toBe(true);
    expect(registerUserSchema.safeParse({ email: 'a@b.com', password: 'x'.repeat(72) }).success).toBe(true);
  });
});

describe('loginSchema', () => {
  it('accepts an empty body (development login)', () => {
    expect(loginSchema.parse({})).toEqual({});
  });

  it('rejects malformed email or userId', () => {
    const result = loginSchema.safeParse({ email: 'bad', userId: 'not-a-uuid' });

    expect(result.success ? {} : result.error.flatten().fieldErrors).toEqual({
      email: ['Invalid email format'],
      userId: ['Invalid user ID format'],
    });
  });
});
