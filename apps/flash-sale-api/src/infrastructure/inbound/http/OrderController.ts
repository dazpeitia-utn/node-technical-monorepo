import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { CreateOrderUseCase } from '../../../application/use-cases/CreateOrderUseCase';
import { GetOrderUseCase } from '../../../application/use-cases/GetOrderUseCase';
import { OrderNotFoundError } from '../../../domain/errors/OrderNotFoundError';
import { RedisService } from '../../cache/redis.service';
import { AuthenticatedRequest, JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiCreateOrder, ApiGetOrder, ApiOrders } from './openapi/orders.docs';
import { createOrderSchema, orderIdSchema } from './order.schema';

const ORDER_LOCK_TTL_SECONDS = 3;

function requireUserId(req: AuthenticatedRequest): string {
  const userId = req.user?.userId;
  if (!userId) {
    throw new UnauthorizedException({ error: 'Unauthorized: User ID not found in token' });
  }
  return userId;
}

@ApiOrders()
@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  // @Inject explícito: tsx/esbuild no emite `design:paramtypes`.
  constructor(
    @Inject(CreateOrderUseCase) private readonly createOrderUseCase: CreateOrderUseCase,
    @Inject(GetOrderUseCase) private readonly getOrderUseCase: GetOrderUseCase,
    @Inject(RedisService) private readonly redisService: RedisService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiCreateOrder()
  async create(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res?: Response,
  ) {
    // 1. Validar el body (solo productId y quantity; el userId nunca viene del cliente)
    const validation = createOrderSchema.safeParse(body);
    if (!validation.success) {
      throw new BadRequestException({
        error: 'Validation Error',
        details: validation.error.flatten().fieldErrors,
      });
    }

    // 2. El userId sale del JWT verificado por JwtAuthGuard
    const userId = requireUserId(req);
    const { productId, quantity } = validation.data;

    // 3. Idempotencia / anti doble clic: candado atómico por usuario y producto en Redis.
    //    SET NX EX en una sola operación: entre N requests simultáneas, solo una lo obtiene.
    const lockKey = `lock:order:${userId}:${productId}`;
    const lockToken = await this.redisService.acquireLock(lockKey, ORDER_LOCK_TTL_SECONDS);
    if (!lockToken) {
      throw new HttpException(
        {
          error: 'Too Many Requests',
          message: 'Ya tienes una orden en proceso para este producto. Por favor espera unos segundos.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 4. Encolar (non-blocking): no se toca PostgreSQL en el request; el worker procesa la orden.
    //    Si se encoló, el candado se mantiene hasta su TTL (anti doble clic);
    //    si falla, se libera para que el usuario pueda reintentar sin esperar.
    try {
      const order = await this.createOrderUseCase.execute({ productId, userId, quantity });
      res?.setHeader('Location', `/orders/${order.id}`);
      return { message: 'Order accepted for processing', data: order };
    } catch (error) {
      await this.redisService.releaseLock(lockKey, lockToken).catch(() => undefined);
      if (error instanceof Error && error.message === 'Quantity must be greater than zero') {
        throw new BadRequestException({ error: error.message });
      }
      throw error;
    }
  }

  @Get(':id')
  @ApiGetOrder()
  async findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const validation = orderIdSchema.safeParse(id);
    if (!validation.success) {
      throw new BadRequestException({ error: 'Validation Error', details: { id: ['Invalid order ID format'] } });
    }

    try {
      const order = await this.getOrderUseCase.execute(validation.data, requireUserId(req));
      return { data: order };
    } catch (error) {
      if (error instanceof OrderNotFoundError) {
        throw new NotFoundException({ error: 'Order not found' });
      }
      throw error;
    }
  }
}
