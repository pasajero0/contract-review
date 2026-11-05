import type { ErrorBody } from '@lex-poc/contract/errors';
import type { CanRequest, FailedReview, RunningReview } from '@lex-poc/contract/documents';
import { findingCount, formatDayMonth, formatTime, secondsBetween } from '@/ui/format';

// Pure functions: what the review screen says, from API values. They never read the clock.

export type Disallowed = Extract<CanRequest, { allowed: false }>;

/** "In progress · requested by X · 3 findings so far · 20 s of 60". Elapsed time is from the server's clock. */
export function progressLine(current: RunningReview, serverTime: number): string {
  const elapsed = secondsBetween(current.requestedAt, serverTime);
  const total = secondsBetween(current.requestedAt, current.deadlineAt);
  return `In progress · requested by ${current.requestedBy} · ${findingCount(current.findingsCount)} so far · ${elapsed} s of ${total}`;
}

export function failureText(failed: FailedReview, timeZone: string): string {
  const what =
    failed.failureReason === 'timeout'
      ? 'Review did not complete within 60 seconds. There is no result.'
      : `Review did not complete: AI error after ${findingCount(failed.findingsCount)}. There is no result.`;
  return `${what} · requested by ${failed.requestedBy} at ${formatTime(failed.requestedAt, timeZone)}`;
}

/** Why a review cannot be requested. Dates and times are in the quota's time zone. */
export function reasonText(reason: Disallowed, timeZone: string): string {
  switch (reason.reason) {
    case 'review_in_progress':
      return `A review is already running — started by ${reason.startedBy} at ${formatTime(reason.startedAt, timeZone)}.`;
    case 'plan_exhausted':
      return `${reason.limit} of ${reason.limit} used. Resets on ${formatDayMonth(reason.resetsAt, timeZone)}.`;
    case 'document_superseded':
      return 'Read-only — a newer version of this document exists.';
  }
}

/** The same reason from a rejected request, or null for an error that is not a reason. */
export function reasonFromError(error: ErrorBody, limit: number): Disallowed | null {
  switch (error.code) {
    case 'review_in_progress':
      return { allowed: false, reason: 'review_in_progress', startedBy: error.startedBy, startedAt: error.startedAt };
    case 'plan_exhausted':
      return { allowed: false, reason: 'plan_exhausted', limit, resetsAt: error.resetsAt };
    case 'document_superseded':
      return { allowed: false, reason: 'document_superseded', currentVersionId: error.currentVersionId };
    default:
      return null;
  }
}
