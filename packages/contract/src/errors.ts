import { z } from 'zod';

export const ErrorBody = z.discriminatedUnion('code', [
  z.object({ code: z.literal('lawyer_required') }),
  z.object({ code: z.literal('lawyer_not_found') }),
  z.object({ code: z.literal('document_not_found') }),
  z.object({ code: z.literal('review_not_found') }),
  z.object({ code: z.literal('document_superseded'), currentVersionId: z.string() }),
  z.object({ code: z.literal('review_in_progress'), startedBy: z.string(), startedAt: z.number().int() }),
  z.object({ code: z.literal('plan_exhausted'), resetsAt: z.number().int() }),
  z.object({ code: z.literal('internal_error') }),
  z.object({ code: z.literal('bad_request') }),
]);
export type ErrorBody = z.infer<typeof ErrorBody>;
