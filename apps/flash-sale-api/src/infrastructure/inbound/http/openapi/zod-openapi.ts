import type { SchemaObject } from '@nestjs/swagger';
import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Convierte un schema de Zod en un SchemaObject de OpenAPI 3.
 * Los schemas de Zod siguen siendo la única fuente de verdad: validan en runtime
 * y generan la documentación, sin duplicar DTOs con decoradores.
 */
export function zodToOpenApi(schema: ZodTypeAny, example?: unknown): SchemaObject {
  const { $schema: _ignored, ...jsonSchema } = zodToJsonSchema(schema, {
    target: 'openApi3',
    $refStrategy: 'none',
  }) as Record<string, unknown>;

  return { ...(jsonSchema as SchemaObject), ...(example !== undefined ? { example } : {}) };
}

/** Schema de un error con forma `{ error, message? }`, como responden los controladores. */
export function errorSchema(example: Record<string, unknown>): SchemaObject {
  return {
    type: 'object',
    properties: {
      error: { type: 'string' },
      message: { type: 'string' },
      details: { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
    },
    required: ['error'],
    example,
  };
}
