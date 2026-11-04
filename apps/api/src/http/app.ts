import { Health } from '@lex-poc/contract';
import Fastify, { type FastifyInstance } from 'fastify';

export function buildApp(): FastifyInstance {
  const app = Fastify();
  app.get('/health', async () => {
    const health: Health = { status: 'ok' };
    return Health.parse(health);
  });
  return app;
}
