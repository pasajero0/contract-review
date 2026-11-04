import { inTransaction, type Db } from '../db/connection.ts';
import type { Config } from '../domain/config.ts';
import { orderFindings } from '../domain/findingOrder.ts';
import { monthWindow } from '../domain/monthWindow.ts';
import {
  effectiveOutcome,
  isSeverity,
  type CanRequestView,
  type CompletedReviewView,
  type DocumentView,
  type FailureReason,
  type FindingView,
  type IncomingFinding,
  type ReviewStatus,
  type ReviewView,
} from '../domain/review.ts';
import type { Clock } from '../ports/clock.ts';
import type { Logger } from '../ports/logger.ts';
import type { Random } from '../ports/random.ts';

export type ReviewServiceDeps = {
  db: Db;
  clock: Clock;
  random: Random;
  config: Config;
  logger: Logger;
};

export type StartedReview = { reviewId: string; documentId: string };

export type RequestRejection =
  | { ok: false; code: 'document_not_found' }
  | { ok: false; code: 'lawyer_not_found' }
  | { ok: false; code: 'document_superseded'; currentVersionId: string }
  | { ok: false; code: 'review_in_progress'; startedBy: string; startedAt: number }
  | { ok: false; code: 'plan_exhausted'; resetsAt: number };

export type RequestResult = { ok: true; review: StartedReview } | RequestRejection;

export type ReviewService = {
  requestReview(documentId: string, lawyerId: string): RequestResult;
  recordFinding(reviewId: string, finding: IncomingFinding): boolean;
  complete(reviewId: string): boolean;
  fail(reviewId: string, reason: FailureReason): boolean;
  expireOverdue(): number;
  getReview(reviewId: string): ReviewView | null;
  getDocument(documentId: string): DocumentView | null;
};

type ReviewRow = {
  status: ReviewStatus;
  failure_reason: FailureReason | null;
  requested_at: number;
  deadline_at: number;
  findings_count: number;
};

const EXPIRE_OVERDUE = `
  UPDATE reviews SET status = 'failed', failure_reason = 'timeout', finished_at = deadline_at
  WHERE status = 'running' AND deadline_at <= ?`;

export function createReviewService(
  { db, clock, random, config, logger }: ReviewServiceDeps,
  // Passed in, because the runner calls this service: importing it here would be a cycle.
  { onStarted }: { onStarted: (review: StartedReview) => void },
): ReviewService {
  function reject(reviewId: string, event: string): void {
    const row = db.prepare('SELECT status, deadline_at FROM reviews WHERE id = ?').get(reviewId) as
      | { status: ReviewStatus; deadline_at: number }
      | undefined;

    if (!row) {
      logger.warn(`review ${reviewId}: ${event} for an unknown review, dropped`);
    } else if (row.status === 'running' || clock.now() >= row.deadline_at) {
      const late = Math.round((clock.now() - row.deadline_at) / 1000);
      logger.warn(`review ${reviewId}: ${event} arrived ${late}s after deadline, dropped`);
    } else {
      logger.warn(`review ${reviewId}: ${event} arrived after the review was ${row.status}, dropped`);
    }
  }

  function fail(reviewId: string, reason: FailureReason): boolean {
    const now = clock.now();
    const { changes } = db
      .prepare(
        `UPDATE reviews SET status = 'failed', failure_reason = ?, finished_at = ?
         WHERE id = ? AND status = 'running' AND deadline_at > ?`,
      )
      .run(reason, now, reviewId, now);
    if (changes === 0) reject(reviewId, 'failure');
    return changes === 1;
  }

  // The newest version at the end of the chain that starts at documentId.
  function newestVersionId(documentId: string): string {
    let id = documentId;
    for (;;) {
      const newer = db.prepare('SELECT id FROM documents WHERE supersedes_id = ?').get(id) as
        | { id: string }
        | undefined;
      if (!newer) return id;
      id = newer.id;
    }
  }

  // The only place that reads finding content, and only for a completed review.
  function readLatestCompleted(documentId: string): CompletedReviewView | null {
    const review = db
      .prepare(
        `SELECT reviews.id AS id, lawyers.name AS name, requested_at, finished_at
         FROM reviews JOIN lawyers ON lawyers.id = reviews.requested_by
         WHERE document_id = ? AND status = 'completed'
         ORDER BY reviews.requested_at DESC, reviews.rowid DESC LIMIT 1`,
      )
      .get(documentId) as { id: string; name: string; requested_at: number; finished_at: number } | undefined;
    if (!review) return null;

    const rows = db
      .prepare(
        `SELECT clause, title, severity, excerpt, explanation FROM findings
         WHERE review_id = ? ORDER BY seq`,
      )
      .all(review.id) as FindingView[];
    const findings = orderFindings(rows);
    const counts = { high: 0, medium: 0, low: 0 };
    for (const item of findings) counts[item.severity] += 1;

    return {
      reviewId: review.id,
      requestedBy: review.name,
      requestedAt: review.requested_at,
      finishedAt: review.finished_at,
      counts,
      findings,
    };
  }

  // The one set of checks, for the request and for the read. Writes nothing.
  // An overdue running review blocks nothing and holds no plan slot.
  function canRequestAt(documentId: string, now: number): CanRequestView {
    const currentVersionId = newestVersionId(documentId);
    if (currentVersionId !== documentId) {
      return { allowed: false, reason: 'document_superseded', currentVersionId };
    }

    const running = db
      .prepare(
        `SELECT lawyers.name AS name, reviews.requested_at AS requested_at
         FROM reviews JOIN lawyers ON lawyers.id = reviews.requested_by
         WHERE reviews.document_id = ? AND reviews.status = 'running' AND reviews.deadline_at > ?`,
      )
      .get(documentId, now) as { name: string; requested_at: number } | undefined;
    if (running) {
      return {
        allowed: false,
        reason: 'review_in_progress',
        startedBy: running.name,
        startedAt: running.requested_at,
      };
    }

    const { startMs, endMs } = monthWindow(now, config.timeZone);
    const { used } = db
      .prepare(
        `SELECT count(*) AS used FROM reviews
         WHERE requested_at >= ? AND requested_at < ?
           AND (status = 'completed' OR (status = 'running' AND deadline_at > ?))`,
      )
      .get(startMs, endMs, now) as { used: number };
    if (used >= config.planLimit) {
      return { allowed: false, reason: 'plan_exhausted', limit: config.planLimit, resetsAt: endMs };
    }
    return { allowed: true, remaining: config.planLimit - used };
  }

  function requestInTransaction(documentId: string, lawyerId: string): RequestResult {
    const now = clock.now();

    db.prepare(EXPIRE_OVERDUE).run(now);

    if (!db.prepare('SELECT 1 FROM documents WHERE id = ?').get(documentId)) {
      return { ok: false, code: 'document_not_found' };
    }
    if (!db.prepare('SELECT 1 FROM lawyers WHERE id = ?').get(lawyerId)) {
      return { ok: false, code: 'lawyer_not_found' };
    }

    const check = canRequestAt(documentId, now);
    if (!check.allowed) {
      switch (check.reason) {
        case 'document_superseded':
          return { ok: false, code: 'document_superseded', currentVersionId: check.currentVersionId };
        case 'review_in_progress':
          return { ok: false, code: 'review_in_progress', startedBy: check.startedBy, startedAt: check.startedAt };
        case 'plan_exhausted':
          return { ok: false, code: 'plan_exhausted', resetsAt: check.resetsAt };
      }
    }

    const reviewId = random.uuid();
    db.prepare(
      `INSERT INTO reviews (id, document_id, requested_by, requested_at, deadline_at, status)
       VALUES (?, ?, ?, ?, ?, 'running')`,
    ).run(reviewId, documentId, lawyerId, now, now + config.reviewTimeoutMs);

    return { ok: true, review: { reviewId, documentId } };
  }

  return {
    requestReview(documentId, lawyerId) {
      const result = inTransaction(db, () => requestInTransaction(documentId, lawyerId));
      // Only after the commit: a rolled-back request must not leave the AI working.
      if (result.ok) onStarted(result.review);
      return result;
    },

    recordFinding(reviewId, finding) {
      if (!isSeverity(finding.severity)) {
        logger.warn(`review ${reviewId}: finding with unknown severity "${finding.severity}", dropped`);
        fail(reviewId, 'ai_error');
        return false;
      }
      const now = clock.now();
      const { changes } = db
        .prepare(
          `INSERT INTO findings (id, review_id, seq, clause, title, severity, excerpt, explanation, received_at)
           SELECT ?, id, (SELECT count(*) + 1 FROM findings WHERE review_id = reviews.id), ?, ?, ?, ?, ?, ?
           FROM reviews WHERE id = ? AND status = 'running' AND deadline_at > ?`,
        )
        .run(
          random.uuid(),
          finding.clause,
          finding.title,
          finding.severity,
          finding.excerpt,
          finding.explanation,
          now,
          reviewId,
          now,
        );
      if (changes === 0) reject(reviewId, 'finding');
      return changes === 1;
    },

    complete(reviewId) {
      const now = clock.now();
      const { changes } = db
        .prepare(
          `UPDATE reviews SET status = 'completed', finished_at = ?
           WHERE id = ? AND status = 'running' AND deadline_at > ?`,
        )
        .run(now, reviewId, now);
      if (changes === 0) reject(reviewId, 'completion');
      return changes === 1;
    },

    fail,

    expireOverdue() {
      return Number(db.prepare(EXPIRE_OVERDUE).run(clock.now()).changes);
    },

    getReview(reviewId) {
      const row = db
        .prepare(
          `SELECT status, failure_reason, requested_at, deadline_at,
                  (SELECT count(*) FROM findings WHERE review_id = reviews.id) AS findings_count
           FROM reviews WHERE id = ?`,
        )
        .get(reviewId) as ReviewRow | undefined;
      if (!row) return null;

      const now = clock.now();
      return {
        reviewId,
        ...effectiveOutcome(row.status, row.failure_reason, row.deadline_at, now),
        findingsCount: row.findings_count,
        requestedAt: row.requested_at,
        deadlineAt: row.deadline_at,
        serverTime: now,
      };
    },

    getDocument(documentId) {
      const doc = db
        .prepare('SELECT title, type, pages FROM documents WHERE id = ?')
        .get(documentId) as { title: string; type: string; pages: number } | undefined;
      if (!doc) return null;

      const now = clock.now();
      const latest = db
        .prepare(
          `SELECT reviews.id AS id, lawyers.name AS name, status, failure_reason, requested_at, deadline_at,
                  (SELECT count(*) FROM findings WHERE review_id = reviews.id) AS findings_count
           FROM reviews JOIN lawyers ON lawyers.id = reviews.requested_by
           WHERE document_id = ? ORDER BY reviews.requested_at DESC, reviews.rowid DESC LIMIT 1`,
        )
        .get(documentId) as (ReviewRow & { id: string; name: string }) | undefined;

      let current: DocumentView['current'] = null;
      let lastFailed: DocumentView['lastFailed'] = null;
      if (latest) {
        const outcome = effectiveOutcome(latest.status, latest.failure_reason, latest.deadline_at, now);
        if (outcome.status === 'running') {
          current = {
            reviewId: latest.id,
            requestedBy: latest.name,
            requestedAt: latest.requested_at,
            deadlineAt: latest.deadline_at,
            findingsCount: latest.findings_count,
          };
        } else if (outcome.status === 'failed' && outcome.failureReason) {
          lastFailed = {
            reviewId: latest.id,
            requestedBy: latest.name,
            requestedAt: latest.requested_at,
            failureReason: outcome.failureReason,
            findingsCount: latest.findings_count,
          };
        }
      }

      const newestId = newestVersionId(documentId);
      const newest =
        newestId === documentId
          ? undefined
          : (db.prepare('SELECT uploaded_at FROM documents WHERE id = ?').get(newestId) as
              | { uploaded_at: number }
              | undefined);

      return {
        documentId,
        title: doc.title,
        type: doc.type,
        pages: doc.pages,
        current,
        lastFailed,
        canRequest: canRequestAt(documentId, now),
        latestCompleted: readLatestCompleted(documentId),
        supersededBy: newest ? { documentId: newestId, uploadedAt: newest.uploaded_at } : null,
        serverTime: now,
      };
    },
  };
}
