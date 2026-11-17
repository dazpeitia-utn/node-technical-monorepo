import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const BEARER_AUTH = 'bearer';
export const SWAGGER_PATH = 'api/docs';

/** Expone Swagger UI en `/api/docs` y el spec OpenAPI en `/api/docs-json`. */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Flash Sale API')
    .setDescription(
      'Flash sale micro-API (Hexagonal Architecture, NestJS, PostgreSQL, Redis).\n\n' +
        'Get a token with `POST /auth/register`, then click **Authorize** and paste it to call protected routes.',
    )
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, BEARER_AUTH)
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: `${SWAGGER_PATH}-json`,
    swaggerOptions: { persistAuthorization: true },
  });
}
