import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_flash_sale';

export class AuthController {
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, userId } = req.body;

      // Usamos un ID por defecto si no se provee, para facilitar pruebas rápidas
      const authenticatedUserId = userId || '123e4567-e89b-12d3-a456-426614174001';
      const userEmail = email || 'user@example.com';

      // Firmamos el token JWT con el payload del usuario
      const token = jwt.sign(
        { userId: authenticatedUserId, email: userEmail },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      res.status(200).json({
        message: 'Login successful',
        token,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}