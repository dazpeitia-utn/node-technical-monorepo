import '../../config/load-env';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

// Separate process from the HTTP API: it can be scaled (more replicas / concurrency)
// independently, and a slow or crashing worker never affects request latency.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks(); // SIGTERM/SIGINT → finish active jobs, then exit
  Logger.log('👷 Order worker started', 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start order worker', error);
  process.exit(1);
});
