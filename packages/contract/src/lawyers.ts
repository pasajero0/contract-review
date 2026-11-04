import { z } from 'zod';

export const Lawyer = z.object({ id: z.string(), name: z.string(), title: z.string() });
export type Lawyer = z.infer<typeof Lawyer>;

export const LawyersResponse = z.object({ lawyers: z.array(Lawyer) });
export type LawyersResponse = z.infer<typeof LawyersResponse>;

export const getLawyers = {
  method: 'GET',
  path: '/lawyers',
  responses: { 200: LawyersResponse },
} as const;
