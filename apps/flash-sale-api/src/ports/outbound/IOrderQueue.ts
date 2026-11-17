import { Order } from '../../domain/model/Order';

/** Payload of an order waiting to be processed in the background. */
export interface OrderJobData {
  orderId: string;
  productId: string;
  userId: string;
  quantity: number;
  requestedAt: string;
}

/** An order that is still in the queue (not yet in PostgreSQL). */
export interface QueuedOrder {
  order: Order; // status PENDING while waiting/active, REJECTED if processing failed for good
  failedReason?: string;
}

export interface IOrderQueue {
  /** Enqueues the order for background processing. Idempotent per order id. */
  enqueue(order: Order): Promise<void>;
  /** Looks up an order that hasn't been persisted yet. */
  findQueued(orderId: string): Promise<QueuedOrder | null>;
}

export function toOrderJobData(order: Order): OrderJobData {
  return {
    orderId: order.id,
    productId: order.productId,
    userId: order.userId,
    quantity: order.quantity,
    requestedAt: new Date().toISOString(),
  };
}

export function fromOrderJobData(data: OrderJobData): Order {
  return new Order(data.orderId, data.productId, data.userId, data.quantity, 'PENDING');
}
