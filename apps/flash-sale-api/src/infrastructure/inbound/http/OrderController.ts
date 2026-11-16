import { Request, Response, NextFunction } from 'express';
import { CreateOrderUseCase } from '../../../application/use-cases/CreateOrderUseCase';
import { createOrderSchema } from './order.schema';

export class OrderController {
  constructor(private readonly createOrderUseCase: CreateOrderUseCase) {}

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validationResult = createOrderSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        res.status(400).json({
          error: 'Validation Error',
          details: validationResult.error.format(),
        });
        return;
      }

      const { productId, userId, quantity } = validationResult.data;

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