export type ReviewStatus = 'running' | 'completed' | 'failed';
export type FailureReason = 'ai_error' | 'timeout';

const SEVERITIES = ['high', 'medium', 'low'];

export function isSeverity(value: string): boolean {
  return SEVERITIES.includes(value);
}

/** A finding as the AI reports it. Severity is checked on input, so it is a plain string here. */
export type IncomingFinding = {
  clause: string | null;
  title: string;
  severity: string;
  excerpt: string | null;
  explanation: string;
};

export type ReviewView = {
  reviewId: string;
  status: ReviewStatus;
  findingsCount: number;
  requestedAt: number;
  deadlineAt: number;
  failureReason: FailureReason | null;
  serverTime: number;
};

/**
 * What a reader sees: a running review past its deadline has already failed,
 * even before the sweeper persists it.
 */
export function effectiveOutcome(
  status: ReviewStatus,
  failureReason: FailureReason | null,
  deadlineAt: number,
  now: number,
): { status: ReviewStatus; failureReason: FailureReason | null } {
  if (status === 'running' && deadlineAt <= now) {
    return { status: 'failed', failureReason: 'timeout' };
  }
  return { status, failureReason };
}
