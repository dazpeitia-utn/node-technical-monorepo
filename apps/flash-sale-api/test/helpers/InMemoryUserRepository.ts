import { type User } from '../../src/domain/model/User';
import { type IUserRepository } from '../../src/ports/outbound/IUserRepository';

export class InMemoryUserRepository implements IUserRepository {
  readonly users: User[] = [];

  async save(user: User): Promise<void> {
    this.users.push(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.users.find((user) => user.email === email) ?? null;
  }
}
