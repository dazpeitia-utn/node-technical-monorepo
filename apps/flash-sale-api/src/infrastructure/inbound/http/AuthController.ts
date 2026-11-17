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
import { RegisterUserUseCase } from '../../../application/use-cases/RegisterUserUseCase';
import { EmailAlreadyRegisteredError } from '../../../domain/errors/EmailAlreadyRegisteredError';
import { JWT_EXPIRES_IN, signAccessToken } from '../../security/jwt';
import { loginSchema, registerUserSchema } from './auth.schema';
import { ApiAuth, ApiLogin, ApiRegister } from './openapi/auth.docs';

const DEV_USER_ID = '123e4567-e89b-12d3-a456-426614174001';
const DEV_EMAIL = 'user@example.com';

@ApiAuth()
@Controller('auth')
export class AuthController {
  // @Inject explícito: tsx/esbuild no emite `design:paramtypes`, así que Nest no puede inferir el tipo.
  constructor(@Inject(RegisterUserUseCase) private readonly registerUserUseCase: RegisterUserUseCase) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiLogin()
  login(@Body() body: unknown) {
    // Login de prueba (sin verificar credenciales), se mantiene el comportamiento previo.
    const validation = loginSchema.safeParse(body ?? {});
    if (!validation.success) {
      throw new BadRequestException({
        error: 'Validation Error',
        details: validation.error.flatten().fieldErrors,
      });
    }

    const { userId = DEV_USER_ID, email = DEV_EMAIL } = validation.data;
    return {
      message: 'Login successful',
      token: signAccessToken({ userId, email }),
    };
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiRegister()
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
        accessToken: signAccessToken({ userId: user.id, email: user.email }),
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
