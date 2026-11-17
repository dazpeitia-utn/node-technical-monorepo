import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type AuthenticatedRequest, JwtAuthGuard } from '../../src/infrastructure/inbound/http/guards/jwt-auth.guard';
import { signAccessToken, verifyAccessToken } from '../../src/infrastructure/security/jwt';
import { USER_ID, bearer } from '../helpers/fixtures';

function contextWith(authorization?: string) {
  const req = { headers: authorization ? { authorization } : {} } as AuthenticatedRequest;
  const context = { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
  return { req, context };
}

function unauthorizedBody(fn: () => unknown) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(UnauthorizedException);
    return (error as UnauthorizedException).getResponse();
  }
  throw new Error('expected UnauthorizedException');
}

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard();

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lets a valid token through and attaches the payload to req.user', () => {
    const { req, context } = contextWith(bearer(USER_ID, 'ada@example.com'));

    expect(guard.canActivate(context)).toBe(true);
    expect(req.user).toEqual({ userId: USER_ID, email: 'ada@example.com' });
  });

  it.each([
    ['no Authorization header', undefined],
    ['a non-Bearer scheme', 'Basic dXNlcjpwYXNz'],
    ['"Bearer" without a token', 'Bearer'],
  ])('rejects %s as missing/malformed', (_case, header) => {
    expect(unauthorizedBody(() => guard.canActivate(contextWith(header).context))).toEqual({
      error: 'Access token missing or malformed',
    });
  });

  it('rejects a token that is not a JWT', () => {
    expect(unauthorizedBody(() => guard.canActivate(contextWith('Bearer not-a-jwt').context))).toEqual({
      error: 'Invalid or expired token',
    });
  });

  it('rejects a token signed with another secret', () => {
    const forged = jwt.sign({ userId: USER_ID, email: 'x@example.com' }, 'attacker-secret');

    expect(unauthorizedBody(() => guard.canActivate(contextWith(`Bearer ${forged}`).context))).toEqual({
      error: 'Invalid or expired token',
    });
  });

  it('rejects an expired token (1h lifetime)', () => {
    vi.useFakeTimers();
    const header = bearer();
    vi.advanceTimersByTime(60 * 60 * 1000 + 1000);

    expect(unauthorizedBody(() => guard.canActivate(contextWith(header).context))).toEqual({
      error: 'Invalid or expired token',
    });
  });
});

describe('jwt helpers', () => {
  it('round-trips only userId and email (no iat/exp leaking into req.user)', () => {
    const token = signAccessToken({ userId: USER_ID, email: 'ada@example.com' });

    expect(verifyAccessToken(token)).toEqual({ userId: USER_ID, email: 'ada@example.com' });
  });
});
