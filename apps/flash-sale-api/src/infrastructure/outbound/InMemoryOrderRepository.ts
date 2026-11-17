import { type Order } from '../../domain/model/Order';
import { type IOrderRepository } from '../../ports/outbound/IOrderRepository';

export class InMemoryOrderRepository implements IOrderRepository {
  private orders: Map<string, Order> = new Map();

  save(order: Order): Promise<void> {
    this.orders.set(order.id, order);
    return Promise.resolve();
  }

  findById(id: string): Promise<Order | null> {
    return Promise.resolve(this.orders.get(id) ?? null);
  }
}
