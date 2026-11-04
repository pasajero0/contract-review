import { z } from 'zod';
import { ErrorBody } from './errors.ts';

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

export const requestReview = {
  method: 'POST',
  path: '/documents/:id/reviews',
  responses: { 201: RequestReviewResponse, 400: ErrorBody, 404: ErrorBody, 409: ErrorBody },
} as const;

export const getReview = {
  method: 'GET',
  path: '/reviews/:id',
  responses: { 200: ReviewResponse, 404: ErrorBody },
} as const;
