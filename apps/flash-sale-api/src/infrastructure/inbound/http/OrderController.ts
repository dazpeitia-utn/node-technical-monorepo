import { Response, NextFunction } from 'express';
import { CreateOrderUseCase } from '../../../application/use-cases/CreateOrderUseCase';
import { createOrderSchema } from './order.schema';
import { AuthenticatedRequest } from './middlewares/auth.middleware';

export class OrderController {
  constructor(private readonly createOrderUseCase: CreateOrderUseCase) {}

  public create = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. Validar el schema del body (solo productId y quantity)
      const validationResult = createOrderSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        res.status(400).json({
          error: 'Validation Error',
          details: validationResult.error.format(),
        });
        return;
      }

      // 2. Extraer el userId de forma segura desde el token JWT (inyectado por el authMiddleware)
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: User ID not found in token' });
        return;
      }

      const { productId, quantity } = validationResult.data;

      // 3. Ejecutar el caso de uso del dominio con el userId seguro
      const order = await this.createOrderUseCase.execute({
        productId,
        userId,
        quantity,
      });

      res.status(201).json({
        message: 'Order created successfully',
        data: order,
      });
    } catch (error: any) {
      if (error.message === 'Quantity must be greater than zero') {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  };
}
