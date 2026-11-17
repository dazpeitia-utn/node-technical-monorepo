import { Order } from '../../domain/model/Order';
import { IOrderRepository } from '../../ports/outbound/IOrderRepository';

/**
 * Runs in the background worker. The queue delivers jobs at-least-once, so both
 * operations are idempotent: processing an order that already has a final status
 * returns it unchanged instead of writing it again.
 */
export class ProcessOrderUseCase {
  constructor(private readonly orderRepository: IOrderRepository) {}

  /** Confirms and persists a queued order. */
  async execute(pending: Order): Promise<Order> {
    const existing = await this.orderRepository.findById(pending.id);
    if (existing?.isFinal()) return existing;

    const confirmed = (existing ?? pending).confirm();
    await this.orderRepository.save(confirmed);
    return confirmed;
  }

  /** Called when processing failed for good (retries exhausted). Never overrides a final status. */
  async reject(pending: Order): Promise<Order> {
    const existing = await this.orderRepository.findById(pending.id);
    if (existing?.isFinal()) return existing;

    const rejected = (existing ?? pending).reject();
    await this.orderRepository.save(rejected);
    return rejected;
  }
}
