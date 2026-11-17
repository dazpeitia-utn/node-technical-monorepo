import { Module } from '@nestjs/common';
import { RegisterUserUseCase } from '../../../application/use-cases/RegisterUserUseCase';
import { IPasswordHasher } from '../../../ports/outbound/IPasswordHasher';
import { IUserRepository } from '../../../ports/outbound/IUserRepository';
import { PASSWORD_HASHER, USER_REPOSITORY } from '../../../ports/outbound/tokens';
import { PostgresUserRepository } from '../../outbound/PostgresUserRepository';
import { ScryptPasswordHasher } from '../../security/password-hasher';
import { AuthController } from './AuthController';

@Module({
  controllers: [AuthController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PostgresUserRepository },
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    {
      // El caso de uso es una clase pura (sin decoradores de Nest): se construye por factory.
      provide: RegisterUserUseCase,
      useFactory: (userRepository: IUserRepository, passwordHasher: IPasswordHasher) =>
        new RegisterUserUseCase(userRepository, passwordHasher),
      inject: [USER_REPOSITORY, PASSWORD_HASHER],
    },
  ],
  exports: [RegisterUserUseCase, USER_REPOSITORY, PASSWORD_HASHER],
})
export class AuthModule {}
