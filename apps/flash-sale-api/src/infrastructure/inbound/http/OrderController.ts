import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CreateOrderUseCase } from '../../../application/use-cases/CreateOrderUseCase';
import { RedisService } from '../../cache/redis.service';
import { AuthenticatedRequest, JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiCreateOrder, ApiOrders } from './openapi/orders.docs';
import { createOrderSchema } from './order.schema';

const ORDER_LOCK_TTL_SECONDS = 3;

@ApiOrders()
@Controller('orders')
export class OrderController {
  // @Inject explícito: tsx/esbuild no emite `design:paramtypes`.
  constructor(
    @Inject(CreateOrderUseCase) private readonly createOrderUseCase: CreateOrderUseCase,
    @Inject(RedisService) private readonly redisService: RedisService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard)
  @ApiCreateOrder()
  async create(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    // 1. Validar el body (solo productId y quantity; el userId nunca viene del cliente)
    const validation = createOrderSchema.safeParse(body);
    if (!validation.success) {
      throw new BadRequestException({
        error: 'Validation Error',
        details: validation.error.flatten().fieldErrors,
      });
    }

    // 2. El userId sale del JWT verificado por JwtAuthGuard
    const userId = req.user?.userId;
    if (!userId) {
      throw new UnauthorizedException({ error: 'Unauthorized: User ID not found in token' });
    }

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

    // 4. Caso de uso de dominio. Si tiene éxito, el candado se mantiene hasta su TTL (anti doble clic);
    //    si falla, se libera para que el usuario pueda reintentar sin esperar.
    try {
      const order = await this.createOrderUseCase.execute({ productId, userId, quantity });
      return { message: 'Order created successfully', data: order };
    } catch (error) {
      await this.redisService.releaseLock(lockKey, lockToken).catch(() => undefined);
      if (error instanceof Error && error.message === 'Quantity must be greater than zero') {
        throw new BadRequestException({ error: error.message });
      }
      throw error;
    }
  }
}
