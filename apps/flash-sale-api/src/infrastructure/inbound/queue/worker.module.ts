import { Module } from '@nestjs/common';
import { ProcessOrderUseCase } from '../../../application/use-cases/ProcessOrderUseCase';
import { IOrderRepository } from '../../../ports/outbound/IOrderRepository';
import { ORDER_REPOSITORY } from '../../../ports/outbound/tokens';
import { PostgresOrderRepository } from '../../outbound/PostgresOrderRepository';
import { ORDER_WORKER_OPTIONS, OrderWorker } from './OrderWorker';

/** Composition root of the background worker process (no HTTP). */
@Module({
  providers: [
    { provide: ORDER_REPOSITORY, useClass: PostgresOrderRepository },
    {
      provide: ProcessOrderUseCase,
      useFactory: (orderRepository: IOrderRepository) => new ProcessOrderUseCase(orderRepository),
      inject: [ORDER_REPOSITORY],
    },
    { provide: ORDER_WORKER_OPTIONS, useValue: {} },
    OrderWorker,
  ],
})
export class WorkerModule {}
