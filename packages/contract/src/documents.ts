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

export const Finding = z.object({
  clause: z.string().nullable(),
  title: z.string(),
  severity: z.enum(['high', 'medium', 'low']),
  excerpt: z.string().nullable(),
  explanation: z.string(),
});
export type Finding = z.infer<typeof Finding>;

export const CompletedReview = z.object({
  reviewId: z.string(),
  requestedBy: z.string(), // the lawyer's name
  requestedAt: z.number().int(),
  finishedAt: z.number().int(),
  counts: z.object({
    high: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
  }),
  findings: z.array(Finding),
});
export type CompletedReview = z.infer<typeof CompletedReview>;

export const DocumentResponse = z.object({
  documentId: z.string(),
  title: z.string(),
  type: z.string(),
  pages: z.number().int(),
  current: RunningReview.nullable(),
  lastFailed: FailedReview.nullable(),
  canRequest: CanRequest,
  latestCompleted: CompletedReview.nullable(),
  // The newest version at the end of the chain; null for a current version.
  supersededBy: z.object({ documentId: z.string(), uploadedAt: z.number().int() }).nullable(),
  serverTime: z.number().int(),
});
export type DocumentResponse = z.infer<typeof DocumentResponse>;

export const getDocument = {
  method: 'GET',
  path: '/documents/:id',
  responses: { 200: DocumentResponse, 404: ErrorBody },
} as const;
