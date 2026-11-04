import { getCurrentLawyerId } from './lawyer';

/** Anything with `parse`, such as a Zod schema from `@lex-poc/contract`. */
type Schema<T> = { parse(data: unknown): T };

/** GET `/api<path>`. Throws on a network error, a bad status or a body that fails the schema. */
export async function apiGet<T>(path: string, schema: Schema<T>): Promise<T> {
  const lawyerId = getCurrentLawyerId();
  const headers: Record<string, string> = lawyerId === null ? {} : { 'X-Lawyer-Id': lawyerId };

  const response = await fetch(`/api${path}`, { headers });
  if (!response.ok) throw new Error(`GET ${path} failed with status ${response.status}`);

  const body: unknown = await response.json();
  return schema.parse(body);
}
