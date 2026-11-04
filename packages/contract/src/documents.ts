import { z } from 'zod';
import { ErrorBody } from './errors.ts';

// All times are epoch milliseconds, UTC.

export const RunningReview = z.object({
  reviewId: z.string(),
  requestedBy: z.string(), // the lawyer's name
  requestedAt: z.number().int(),
  deadlineAt: z.number().int(),
  findingsCount: z.number().int().nonnegative(),
});
export type RunningReview = z.infer<typeof RunningReview>;

export const FailedReview = z.object({
  reviewId: z.string(),
  requestedBy: z.string(),
  requestedAt: z.number().int(),
  failureReason: z.enum(['ai_error', 'timeout']),
  findingsCount: z.number().int().nonnegative(),
});
export type FailedReview = z.infer<typeof FailedReview>;

export const CanRequest = z.union([
  z.object({ allowed: z.literal(true), remaining: z.number().int().positive() }),
  z.object({
    allowed: z.literal(false),
    reason: z.literal('review_in_progress'),
    startedBy: z.string(),
    startedAt: z.number().int(),
  }),
  z.object({
    allowed: z.literal(false),
    reason: z.literal('plan_exhausted'),
    limit: z.number().int().positive(),
    resetsAt: z.number().int(),
  }),
  z.object({
    allowed: z.literal(false),
    reason: z.literal('document_superseded'),
    currentVersionId: z.string(),
  }),
]);
export type CanRequest = z.infer<typeof CanRequest>;

export const DocumentResponse = z.object({
  documentId: z.string(),
  title: z.string(),
  type: z.string(),
  pages: z.number().int(),
  current: RunningReview.nullable(),
  lastFailed: FailedReview.nullable(),
  canRequest: CanRequest,
  serverTime: z.number().int(),
});
export type DocumentResponse = z.infer<typeof DocumentResponse>;

export const getDocument = {
  method: 'GET',
  path: '/documents/:id',
  responses: { 200: DocumentResponse, 404: ErrorBody },
} as const;
