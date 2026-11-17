import { OrderNotFoundError } from '../../domain/errors/OrderNotFoundError';
import { type Order } from '../../domain/model/Order';
import { type IOrderQueue } from '../../ports/outbound/IOrderQueue';
import { type IOrderRepository } from '../../ports/outbound/IOrderRepository';

/**
 * Returns an order for its owner, wherever it currently is: PostgreSQL once processed,
 * or the queue while it's still PENDING (or REJECTED after failing for good).
 * Orders of other users are reported as not found, so ids can't be probed.
 */
export class GetOrderUseCase {
  constructor(
    private readonly orderRepository: IOrderRepository,
    private readonly orderQueue: IOrderQueue,
  ) {}

  async execute(orderId: string, requesterId: string): Promise<Order> {
    const order = (await this.orderRepository.findById(orderId)) ?? (await this.orderQueue.findQueued(orderId))?.order;

    if (!order || !order.belongsTo(requesterId)) {
      throw new OrderNotFoundError(orderId);
    }
    return order;
  }
}
