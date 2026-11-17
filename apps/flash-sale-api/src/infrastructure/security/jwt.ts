import jwt from 'jsonwebtoken';

export const JWT_EXPIRES_IN = '1h';

export interface AccessTokenPayload {
  userId: string;
  email: string;
}

// Se lee en cada llamada (no al importar) para respetar el `.env` cargado en el arranque.
function jwtSecret(): string {
  return process.env.JWT_SECRET || 'super_secret_key_flash_sale';
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, jwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

/** Lanza si el token es inválido o expiró. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  const { userId, email } = jwt.verify(token, jwtSecret()) as AccessTokenPayload;
  return { userId, email };
}
