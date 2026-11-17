import { EmailAlreadyRegisteredError } from '../../domain/errors/EmailAlreadyRegisteredError';
import { User } from '../../domain/model/User';
import { type IPasswordHasher } from '../../ports/outbound/IPasswordHasher';
import { type IUserRepository } from '../../ports/outbound/IUserRepository';

export interface RegisterUserCommand {
  email: string;
  password: string;
}

export interface RegisteredUser {
  id: string;
  email: string;
  createdAt: Date;
}

export class RegisterUserUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly passwordHasher: IPasswordHasher,
  ) {}

  async execute(command: RegisterUserCommand): Promise<RegisteredUser> {
    const email = command.email.trim().toLowerCase();

    if (await this.userRepository.findByEmail(email)) {
      throw new EmailAlreadyRegisteredError();
    }

    const passwordHash = await this.passwordHasher.hash(command.password);
    const user = User.create(email, passwordHash);
    await this.userRepository.save(user);

    return { id: user.id, email: user.email, createdAt: user.createdAt };
  }
}
