import { describe, expect, it } from 'vitest';
import { ScryptPasswordHasher } from '../../src/infrastructure/security/password-hasher';

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('produces a `scrypt$salt$hash` string that does not contain the password', async () => {
    const hash = await hasher.hash('super-secret');

    expect(hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(hash).not.toContain('super-secret');
  });

  it('uses a random salt (same password, different hashes)', async () => {
    expect(await hasher.hash('super-secret')).not.toBe(await hasher.hash('super-secret'));
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hasher.hash('super-secret');

    expect(await hasher.verify('super-secret', hash)).toBe(true);
    expect(await hasher.verify('Super-secret', hash)).toBe(false);
  });

  it.each(['', 'plain-text', 'bcrypt$abc$def', 'scrypt$$', 'scrypt$abcd'])(
    'returns false (does not throw) for a malformed stored hash: %j',
    async (stored) => {
      expect(await hasher.verify('super-secret', stored)).toBe(false);
    },
  );
});
