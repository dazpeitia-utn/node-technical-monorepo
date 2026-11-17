import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
} from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { RegisterUserUseCase } from '../../../application/use-cases/RegisterUserUseCase';
import { EmailAlreadyRegisteredError } from '../../../domain/errors/EmailAlreadyRegisteredError';
import { registerUserSchema } from './auth.schema';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_flash_sale';
const JWT_EXPIRES_IN = '1h';

function signAccessToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

@Controller('auth')
export class AuthController {
  // @Inject explícito: tsx/esbuild no emite `design:paramtypes`, así que Nest no puede inferir el tipo.
  constructor(@Inject(RegisterUserUseCase) private readonly registerUserUseCase: RegisterUserUseCase) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: { email?: string; userId?: string } = {}) {
    // Login de prueba (sin verificar credenciales), se mantiene el comportamiento previo.
    const userId = body.userId || '123e4567-e89b-12d3-a456-426614174001';
    const email = body.email || 'user@example.com';

    return {
      message: 'Login successful',
      token: signAccessToken(userId, email),
    };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: unknown) {
    const validation = registerUserSchema.safeParse(body);
    if (!validation.success) {
      throw new BadRequestException({
        error: 'Validation Error',
        details: validation.error.flatten().fieldErrors,
      });
    }

    try {
      const user = await this.registerUserUseCase.execute(validation.data);

      return {
        message: 'User registered successfully',
        data: user,
        accessToken: signAccessToken(user.id, user.email),
        tokenType: 'Bearer',
        expiresIn: JWT_EXPIRES_IN,
      };
    } catch (error) {
      if (error instanceof EmailAlreadyRegisteredError) {
        throw new ConflictException({ error: error.message });
      }
      throw error;
    }
  }
}
