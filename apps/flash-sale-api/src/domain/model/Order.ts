import { randomUUID } from 'node:crypto';

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED';

export class Order {
  constructor(
    public readonly id: string,
    public readonly productId: string,
    public readonly userId: string,
    public readonly quantity: number,
    public readonly status: OrderStatus,
  ) {}

  static create(productId: string, userId: string, quantity: number): Order {
    if (quantity <= 0) {
      throw new Error('Quantity must be greater than zero');
    }
    return new Order(randomUUID(), productId, userId, quantity, 'PENDING');
  }

  confirm(): Order {
    return this.withStatus('CONFIRMED');
  }

  reject(): Order {
    return this.withStatus('REJECTED');
  }

  isFinal(): boolean {
    return this.status !== 'PENDING';
  }

  belongsTo(userId: string): boolean {
    return this.userId === userId;
  }

  private withStatus(status: OrderStatus): Order {
    if (this.isFinal()) {
      throw new Error(`Order ${this.id} is already ${this.status}`);
    }
    return new Order(this.id, this.productId, this.userId, this.quantity, status);
  }
}
