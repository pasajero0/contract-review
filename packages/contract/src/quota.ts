import { z } from 'zod';
import { ErrorBody } from './errors.ts';

// All times are epoch milliseconds, UTC.

export const QuotaResponse = z.object({
  limit: z.number().int().positive(),
  used: z.number().int().nonnegative(),
  running: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  month: z.string(), // 'YYYY-MM' in the workspace time zone
  resetsAt: z.number().int(),
  timeZone: z.string(),
});
export type QuotaResponse = z.infer<typeof QuotaResponse>;

export const getQuota = {
  method: 'GET',
  path: '/quota',
  responses: { 200: QuotaResponse, 500: ErrorBody },
} as const;
