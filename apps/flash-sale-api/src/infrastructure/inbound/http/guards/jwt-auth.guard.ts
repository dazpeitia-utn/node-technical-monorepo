import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AccessTokenPayload, verifyAccessToken } from '../../../security/jwt';

export interface AuthenticatedRequest extends Request {
  user?: AccessTokenPayload;
}

/** Exige `Authorization: Bearer <JWT>` y deja el payload en `req.user`. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException({ error: 'Access token missing or malformed' });
    }

    try {
      req.user = verifyAccessToken(authHeader.slice('Bearer '.length));
      return true;
    } catch {
      throw new UnauthorizedException({ error: 'Invalid or expired token' });
    }
  }
}
