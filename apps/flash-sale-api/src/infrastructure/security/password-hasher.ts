import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Injectable } from '@nestjs/common';
import { IPasswordHasher } from '../../ports/outbound/IPasswordHasher';

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;
const ALGORITHM = 'scrypt';

/**
 * Hasher basado en scrypt (node:crypto): memory-hard, sin dependencias nativas.
 * Formato almacenado: `scrypt$<salt hex>$<hash hex>`.
 */
@Injectable()
export class ScryptPasswordHasher implements IPasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const derived = await scryptAsync(plainPassword, salt, KEY_LENGTH);
    return `${ALGORITHM}$${salt}$${derived.toString('hex')}`;
  }

  async verify(plainPassword: string, passwordHash: string): Promise<boolean> {
    const [algorithm, salt, expectedHex] = passwordHash.split('$');
    if (algorithm !== ALGORITHM || !salt || !expectedHex) return false;

    const expected = Buffer.from(expectedHex, 'hex');
    const derived = await scryptAsync(plainPassword, salt, expected.length);
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  }
}
