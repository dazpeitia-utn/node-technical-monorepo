import { describe, it, expect, beforeEach } from 'vitest';
import { RegisterUserUseCase } from '../../src/application/use-cases/RegisterUserUseCase';
import { EmailAlreadyRegisteredError } from '../../src/domain/errors/EmailAlreadyRegisteredError';
import { ScryptPasswordHasher } from '../../src/infrastructure/security/password-hasher';
import { InMemoryUserRepository } from '../helpers/InMemoryUserRepository';

describe('RegisterUserUseCase', () => {
  let userRepository: InMemoryUserRepository;
  let passwordHasher: ScryptPasswordHasher;
  let registerUserUseCase: RegisterUserUseCase;

  beforeEach(() => {
    userRepository = new InMemoryUserRepository();
    passwordHasher = new ScryptPasswordHasher();
    registerUserUseCase = new RegisterUserUseCase(userRepository, passwordHasher);
  });

  it('stores a user with a hashed password and returns the public profile', async () => {
    const result = await registerUserUseCase.execute({
      email: 'Ada@Example.com',
      password: 'super-secret',
    });

    expect(result.id).toBeTypeOf('string');
    expect(result.email).toBe('ada@example.com');
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('passwordHash');

    const stored = await userRepository.findByEmail('ada@example.com');
    expect(stored?.passwordHash).not.toBe('super-secret');
    expect(stored?.passwordHash.startsWith('scrypt$')).toBe(true);
    expect(await passwordHasher.verify('super-secret', stored!.passwordHash)).toBe(true);
    expect(await passwordHasher.verify('wrong-password', stored!.passwordHash)).toBe(false);
  });

  it('treats emails case-insensitively when checking duplicates', async () => {
    await registerUserUseCase.execute({ email: 'ada@example.com', password: 'super-secret' });

    await expect(
      registerUserUseCase.execute({ email: '  ADA@Example.com ', password: 'another-secret' }),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    expect(userRepository.users).toHaveLength(1);
  });

  it('rejects a duplicated email', async () => {
    await registerUserUseCase.execute({ email: 'ada@example.com', password: 'super-secret' });

    await expect(
      registerUserUseCase.execute({ email: 'ada@example.com', password: 'another-secret' }),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });
});
