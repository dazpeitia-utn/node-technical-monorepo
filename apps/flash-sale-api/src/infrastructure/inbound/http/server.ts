import '../../config/load-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { SWAGGER_PATH, setupSwagger } from './openapi/swagger';

async function bootstrap(): Promise<void> {
  // Composition root: AppModule -> CacheModule (Redis), AuthModule (/auth/*), OrdersModule (/orders).
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();

  setupSwagger(app);

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port);
  console.log(`🚀 Flash Sale API (NestJS) running with PostgreSQL & JWT Auth on port ${port}`);
  console.log(`📚 Swagger UI: http://localhost:${port}/${SWAGGER_PATH}`);
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start Flash Sale API', error);
  process.exit(1);
});
