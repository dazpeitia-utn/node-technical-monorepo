import { type Order } from '../../domain/model/Order';

export interface IOrderRepository {
  /** Insert or update by id (idempotent: safe to call again for the same order). */
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
}
