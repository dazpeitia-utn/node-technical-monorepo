import { IOrderRepository } from '../../ports/outbound/IOrderRepository';
import { Order } from '../../domain/model/Order';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class PostgresOrderRepository implements IOrderRepository {
  async save(order: Order): Promise<void> {
    await prisma.orderModel.create({
      data: {
        id: order.id,
        productId: order.productId,
        userId: order.userId,
        quantity: order.quantity,
        status: order.status,
      },
    });
  }

  async findById(id: string): Promise<Order | null> {
    const record = await prisma.orderModel.findUnique({
      where: { id },
    });

    if (!record) return null;

    return new Order(
      record.id,
      record.productId,
      record.userId,
      record.quantity,
      record.status as 'PENDING' | 'CONFIRMED' | 'REJECTED'
    );
  }
}