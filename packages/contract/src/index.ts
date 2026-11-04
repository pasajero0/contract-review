import { z } from 'zod';

// Trial schema: proves that the API and the web app compile against one contract.
export const Health = z.object({ status: z.literal('ok') });
export type Health = z.infer<typeof Health>;

// All times are epoch milliseconds, UTC.

export const RequestReviewResponse = z.object({ reviewId: z.string() });
export type RequestReviewResponse = z.infer<typeof RequestReviewResponse>;

export const ReviewResponse = z.object({
  reviewId: z.string(),
  status: z.enum(['running', 'completed', 'failed']),
  findingsCount: z.number().int().nonnegative(),
  requestedAt: z.number().int(),
  deadlineAt: z.number().int(),
  failureReason: z.enum(['ai_error', 'timeout']).nullable(),
  serverTime: z.number().int(),
});
export type ReviewResponse = z.infer<typeof ReviewResponse>;

export const ErrorBody = z.discriminatedUnion('code', [
  z.object({ code: z.literal('lawyer_required') }),
  z.object({ code: z.literal('lawyer_not_found') }),
  z.object({ code: z.literal('document_not_found') }),
  z.object({ code: z.literal('review_not_found') }),
  z.object({ code: z.literal('document_superseded'), currentVersionId: z.string() }),
  z.object({ code: z.literal('review_in_progress'), startedBy: z.string(), startedAt: z.number().int() }),
  z.object({ code: z.literal('plan_exhausted'), resetsAt: z.number().int() }),
]);
export type ErrorBody = z.infer<typeof ErrorBody>;
