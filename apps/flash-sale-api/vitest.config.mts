import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        // Composition root y adaptadores contra infraestructura real (Postgres/Redis):
        // se validan con la corrida manual / pruebas de carga, no con unit tests.
        'src/infrastructure/inbound/http/server.ts',
        'src/infrastructure/config/**',
        'src/infrastructure/outbound/Postgres*.ts',
        'src/infrastructure/cache/redis.service.ts',
        // Cableado de DI sin lógica (módulos Nest y tokens).
        'src/**/*.module.ts',
        'src/ports/outbound/tokens.ts',
      ],
      reporter: ['text', 'html', 'lcov'],
    },
  },
});
