import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { EmailAlreadyRegisteredError } from '../../domain/errors/EmailAlreadyRegisteredError';
import { User } from '../../domain/model/User';
import { IUserRepository } from '../../ports/outbound/IUserRepository';

const prisma = new PrismaClient();

@Injectable()
export class PostgresUserRepository implements IUserRepository {
  async save(user: User): Promise<void> {
    try {
      await prisma.userModel.create({
        data: {
          id: user.id,
          email: user.email,
          passwordHash: user.passwordHash,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      // Carrera entre dos registros simultáneos: la constraint UNIQUE(email) es la fuente de verdad.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new EmailAlreadyRegisteredError();
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const record = await prisma.userModel.findUnique({ where: { email } });
    if (!record) return null;
    return new User(record.id, record.email, record.passwordHash, record.createdAt);
  }
}
