import { Order } from '../../domain/model/Order';
import { IOrderRepository } from '../../ports/outbound/IOrderRepository';

export interface CreateOrderCommand {
  productId: string;
  userId: string;
  quantity: number;
}

export class CreateOrderUseCase {
  constructor(private readonly orderRepository: IOrderRepository) {}

  async execute(command: CreateOrderCommand): Promise<Order> {
    const order = Order.create(command.productId, command.userId, command.quantity);
    await this.orderRepository.save(order);
    return order;
  }
}