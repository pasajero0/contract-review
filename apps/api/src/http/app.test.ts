import { Health } from '@lex-poc/contract';
import { expect, it } from 'vitest';
import { buildApp } from './app.ts';

it('GET /health responds with the contract schema', async () => {
  const response = await buildApp().inject({ method: 'GET', url: '/health' });

  expect(response.statusCode).toBe(200);
  expect(Health.parse(response.json())).toEqual({ status: 'ok' });
});
