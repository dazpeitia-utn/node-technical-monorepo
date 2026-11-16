import express from 'express';
import { OrderController } from './OrderController';
import { CreateOrderUseCase } from '../../../application/use-cases/CreateOrderUseCase';
import { InMemoryOrderRepository } from '../../outbound/InMemoryOrderRepository';

const app = express();
app.use(express.json());

// Wiring de dependencias (Composition Root)
const orderRepository = new InMemoryOrderRepository();
const createOrderUseCase = new CreateOrderUseCase(orderRepository);
const orderController = new OrderController(createOrderUseCase);

app.post('/orders', orderController.create);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Flash Sale API running on port ${PORT}`);
});