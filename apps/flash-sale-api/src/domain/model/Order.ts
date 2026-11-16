export class Order {
  constructor(
    public readonly id: string,
    public readonly productId: string,
    public readonly userId: string,
    public readonly quantity: number,
    public readonly status: 'PENDING' | 'CONFIRMED' | 'REJECTED'
  ) {}

  static create(productId: string, userId: string, quantity: number): Order {
    if (quantity <= 0) {
      throw new Error('Quantity must be greater than zero');
    }
    const id = crypto.randomUUID();
    return new Order(id, productId, userId, quantity, 'PENDING');
  }
}