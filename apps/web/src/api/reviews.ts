import type { ErrorBody } from '@lex-poc/contract/errors';
import type { RequestReviewResponse } from '@lex-poc/contract/reviews';

export type RequestReviewResult =
  | { ok: true; status: number; body: RequestReviewResponse }
  | { ok: false; status: number; body: ErrorBody };

export async function requestReview(documentId: string, lawyerId: string): Promise<RequestReviewResult> {
  const response = await fetch(`/api/documents/${documentId}/reviews`, {
    method: 'POST',
    headers: { 'X-Lawyer-Id': lawyerId },
  });
  const body: unknown = await response.json();

  return response.ok
    ? { ok: true, status: response.status, body: body as RequestReviewResponse }
    : { ok: false, status: response.status, body: body as ErrorBody };
}
