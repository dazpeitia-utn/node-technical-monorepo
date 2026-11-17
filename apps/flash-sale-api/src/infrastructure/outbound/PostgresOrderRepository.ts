import { PrismaClient } from '@prisma/client';
import { Order, OrderStatus } from '../../domain/model/Order';
import { IOrderRepository } from '../../ports/outbound/IOrderRepository';

const prisma = new PrismaClient();

export class PostgresOrderRepository implements IOrderRepository {
  // Upsert by id: the queue delivers jobs at-least-once, so saving the same order twice
  // must neither fail nor duplicate it.
  async save(order: Order): Promise<void> {
    await prisma.orderModel.upsert({
      where: { id: order.id },
      create: {
        id: order.id,
        productId: order.productId,
        userId: order.userId,
        quantity: order.quantity,
        status: order.status,
      },
      update: { status: order.status },
    });
  }

  async findById(id: string): Promise<Order | null> {
    const record = await prisma.orderModel.findUnique({ where: { id } });
    if (!record) return null;

    return new Order(record.id, record.productId, record.userId, record.quantity, record.status as OrderStatus);
  }
}
