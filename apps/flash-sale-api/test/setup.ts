// Se ejecuta antes de cada archivo de test.
import 'reflect-metadata';

// Secreto fijo para que los tests no dependan del `.env` local.
process.env.JWT_SECRET = 'test-jwt-secret';
