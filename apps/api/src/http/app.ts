import Fastify, { type FastifyInstance } from 'fastify';
import type { ErrorBody } from '@lex-poc/contract/errors';

export function buildApp(logger: { warn(message: string): void }): FastifyInstance {
  const app = Fastify();
  app.setErrorHandler((error, request, reply) => {
    const status = (error as { statusCode?: unknown }).statusCode;
    if (typeof status === 'number' && status >= 400 && status <= 499) {
      const body: ErrorBody = { code: 'bad_request' };
      return reply.status(status).send(body);
    }
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    logger.warn(`${request.method} ${request.url} failed: ${detail}`);
    const body: ErrorBody = { code: 'internal_error' };
    return reply.status(500).send(body);
  });
  return app;
}
