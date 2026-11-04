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

export type RunningReviewView = {
  reviewId: string;
  requestedBy: string;
  requestedAt: number;
  deadlineAt: number;
  findingsCount: number;
};

export type FailedReviewView = {
  reviewId: string;
  requestedBy: string;
  requestedAt: number;
  failureReason: FailureReason;
  findingsCount: number;
};

export type CanRequestView =
  | { allowed: true; remaining: number }
  | { allowed: false; reason: 'review_in_progress'; startedBy: string; startedAt: number }
  | { allowed: false; reason: 'plan_exhausted'; limit: number; resetsAt: number }
  | { allowed: false; reason: 'document_superseded'; currentVersionId: string };

export type FindingView = {
  clause: string | null;
  title: string;
  severity: 'high' | 'medium' | 'low';
  excerpt: string | null;
  explanation: string;
};

export type CompletedReviewView = {
  reviewId: string;
  requestedBy: string;
  requestedAt: number;
  finishedAt: number;
  counts: { high: number; medium: number; low: number };
  findings: FindingView[];
};

export type DocumentView = {
  documentId: string;
  title: string;
  type: string;
  pages: number;
  current: RunningReviewView | null;
  lastFailed: FailedReviewView | null;
  canRequest: CanRequestView;
  latestCompleted: CompletedReviewView | null;
  supersededBy: { documentId: string; uploadedAt: number } | null;
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

export type ReviewSummaryView = {
  reviewId: string;
  requestedBy: string;
  requestedAt: number;
  findingsCount: number;
  highCount: number;
};

export type DocumentStateView =
  | { kind: 'not_reviewed' }
  | ({ kind: 'in_progress' } & RunningReviewView)
  | ({ kind: 'completed' } & ReviewSummaryView)
  | ({ kind: 'failed' } & FailedReviewView & { latestCompleted: ReviewSummaryView | null });

export type DocumentListItemView = {
  documentId: string;
  title: string;
  type: string;
  pages: number;
  supersededBy: { documentId: string; uploadedAt: number } | null;
  state: DocumentStateView;
};

export type DocumentListView = { documents: DocumentListItemView[]; serverTime: number };

export type LawyerView = { id: string; name: string; title: string };

export type QuotaView = {
  limit: number;
  used: number;
  running: number;
  remaining: number;
  month: string;
  resetsAt: number;
  timeZone: string;
};
