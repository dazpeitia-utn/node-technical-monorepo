import { Order } from '../../domain/model/Order';
import { type IOrderQueue } from '../../ports/outbound/IOrderQueue';

export interface CreateOrderCommand {
  productId: string;
  userId: string;
  quantity: number;
}

/**
 * Accepts an order and hands it to the background queue (non-blocking).
 * Domain rules are checked here, synchronously, so invalid orders are rejected
 * right away; persistence and the final status happen in ProcessOrderUseCase.
 */
export class CreateOrderUseCase {
  constructor(private readonly orderQueue: IOrderQueue) {}

  async execute(command: CreateOrderCommand): Promise<Order> {
    const order = Order.create(command.productId, command.userId, command.quantity);
    await this.orderQueue.enqueue(order);
    return order;
  }
}
