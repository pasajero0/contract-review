import { ErrorBody } from '@lex-poc/contract/errors';
import { getCurrentLawyerId } from './lawyer';

/** Anything with `parse`, such as a Zod schema from `@lex-poc/contract`. */
type Schema<T> = { parse(data: unknown): T };

/** GET `/api<path>`. Throws on a network error, a bad status or a body that fails the schema. */
export async function apiGet<T>(path: string, schema: Schema<T>): Promise<T> {
  const response = await fetch(`/api${path}`, { headers: lawyerHeaders() });
  if (!response.ok) throw new Error(`GET ${path} failed with status ${response.status}`);

  const body: unknown = await response.json();
  return schema.parse(body);
}

export type PostResult<T> = { ok: true; body: T } | { ok: false; error: ErrorBody };

/**
 * POST `/api<path>` with no body. A `4xx` with a known error body comes back as `{ ok: false }`.
 * Throws on a network error, a `5xx`, an unknown error body or a success body that fails the schema.
 */
export async function apiPost<T>(path: string, schema: Schema<T>): Promise<PostResult<T>> {
  const response = await fetch(`/api${path}`, { method: 'POST', headers: lawyerHeaders() });
  const body: unknown = await response.json().catch(() => undefined);

  if (response.ok) return { ok: true, body: schema.parse(body) };
  if (response.status >= 400 && response.status < 500) {
    const error = ErrorBody.safeParse(body);
    if (error.success) return { ok: false, error: error.data };
  }
  throw new Error(`POST ${path} failed with status ${response.status}`);
}

function lawyerHeaders(): Record<string, string> {
  const lawyerId = getCurrentLawyerId();
  return lawyerId === null ? {} : { 'X-Lawyer-Id': lawyerId };
}
