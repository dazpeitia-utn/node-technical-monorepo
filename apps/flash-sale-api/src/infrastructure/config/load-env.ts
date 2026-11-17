// Carga `.env` (desde el cwd) en process.env antes de que se instancien Prisma/Redis.
// Las variables ya definidas en el entorno tienen prioridad. Si no hay `.env`, se ignora.
try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan solo las variables del entorno.
}
