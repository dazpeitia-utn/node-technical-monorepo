import express from 'express';
import { OrderController } from './OrderController';
import { CreateOrderUseCase } from '../../../application/use-cases/CreateOrderUseCase';
import { PostgresOrderRepository } from '../../outbound/PostgresOrderRepository';
import { AuthController } from './AuthController';
import { authMiddleware } from './middlewares/auth.middleware';

const app = express();
app.use(express.json());

// Wiring de dependencias (Composition Root)
const orderRepository = new PostgresOrderRepository();
const createOrderUseCase = new CreateOrderUseCase(orderRepository);

const orderController = new OrderController(createOrderUseCase);
const authController = new AuthController();

// 1. Ruta pública para hacer login y obtener el token JWT
app.post('/auth/login', authController.login);

// 2. Ruta protegida: exige token JWT válido para crear órdenes
app.post('/orders', authMiddleware, orderController.create);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Flash Sale API running with PostgreSQL & JWT Auth on port ${PORT}`);
});