import type { Db } from '../db/connection.ts';
import type { Config } from '../domain/config.ts';
import { monthWindow } from '../domain/monthWindow.ts';
import {
  effectiveOutcome,
  type DocumentListItemView,
  type DocumentListView,
  type DocumentStateView,
  type FailureReason,
  type LawyerView,
  type QuotaView,
  type ReviewStatus,
  type ReviewSummaryView,
} from '../domain/review.ts';
import type { Clock } from '../ports/clock.ts';

export type LatestReviewRow = {
  id: string;
  name: string;
  status: ReviewStatus;
  failure_reason: FailureReason | null;
  requested_at: number;
  deadline_at: number;
  findings_count: number;
};

type DocumentRow = { id: string; title: string; type: string; pages: number; supersedes_id: string | null };

// The read side shared by getDocument, getQuota and listDocuments. Writes nothing.
export function createReviewQueries(db: Db, clock: Clock, config: Config) {
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

  function supersededBy(documentId: string): { documentId: string; uploadedAt: number } | null {
    const newestId = newestVersionId(documentId);
    if (newestId === documentId) return null;
    const newest = db.prepare('SELECT uploaded_at FROM documents WHERE id = ?').get(newestId) as
      | { uploaded_at: number }
      | undefined;
    return newest ? { documentId: newestId, uploadedAt: newest.uploaded_at } : null;
  }

  // The latest review of a document, whatever its status.
  function latestReview(documentId: string): LatestReviewRow | undefined {
    return db
      .prepare(
        `SELECT reviews.id AS id, lawyers.name AS name, status, failure_reason, requested_at, deadline_at,
                (SELECT count(*) FROM findings WHERE review_id = reviews.id) AS findings_count
         FROM reviews JOIN lawyers ON lawyers.id = reviews.requested_by
         WHERE document_id = ? ORDER BY reviews.requested_at DESC, reviews.rowid DESC LIMIT 1`,
      )
      .get(documentId) as LatestReviewRow | undefined;
  }

  // The one source of the plan count, for the quota read and for the request check.
  // An overdue running review holds no plan slot.
  function planUsage(now: number) {
    const { startMs, endMs, month } = monthWindow(now, config.timeZone);
    const counts = db
      .prepare(
        `SELECT coalesce(sum(status = 'completed'), 0) AS used,
                coalesce(sum(status = 'running' AND deadline_at > ?), 0) AS running
         FROM reviews WHERE requested_at >= ? AND requested_at < ?`,
      )
      .get(now, startMs, endMs) as { used: number; running: number };
    return { ...counts, month, endMs };
  }

  // Counts only: no finding content.
  function summaryOfLatestCompleted(documentId: string): ReviewSummaryView | null {
    const row = db
      .prepare(
        `SELECT reviews.id AS id, lawyers.name AS name, requested_at,
                (SELECT count(*) FROM findings WHERE review_id = reviews.id) AS findings_count,
                (SELECT count(*) FROM findings WHERE review_id = reviews.id AND severity = 'high') AS high_count
         FROM reviews JOIN lawyers ON lawyers.id = reviews.requested_by
         WHERE document_id = ? AND status = 'completed'
         ORDER BY reviews.requested_at DESC, reviews.rowid DESC LIMIT 1`,
      )
      .get(documentId) as
      | { id: string; name: string; requested_at: number; findings_count: number; high_count: number }
      | undefined;
    if (!row) return null;
    return {
      reviewId: row.id,
      requestedBy: row.name,
      requestedAt: row.requested_at,
      findingsCount: row.findings_count,
      highCount: row.high_count,
    };
  }

  function stateOf(documentId: string, now: number): DocumentStateView {
    const latest = latestReview(documentId);
    if (!latest) return { kind: 'not_reviewed' };

    const base = {
      reviewId: latest.id,
      requestedBy: latest.name,
      requestedAt: latest.requested_at,
      findingsCount: latest.findings_count,
    };
    const outcome = effectiveOutcome(latest.status, latest.failure_reason, latest.deadline_at, now);
    if (outcome.status === 'running') {
      return { kind: 'in_progress', ...base, deadlineAt: latest.deadline_at };
    }
    if (outcome.status === 'failed' && outcome.failureReason) {
      return {
        kind: 'failed',
        ...base,
        failureReason: outcome.failureReason,
        latestCompleted: summaryOfLatestCompleted(documentId),
      };
    }
    // The latest review is the completed one.
    const summary = summaryOfLatestCompleted(documentId);
    return summary ? { kind: 'completed', ...summary } : { kind: 'not_reviewed' };
  }

  function listLawyers(): LawyerView[] {
    return db.prepare('SELECT id, name, title FROM lawyers ORDER BY rowid').all() as LawyerView[];
  }

  function getQuota(): QuotaView {
    const { used, running, month, endMs } = planUsage(clock.now());
    return {
      limit: config.planLimit,
      used,
      running,
      remaining: Math.max(0, config.planLimit - used - running),
      month,
      resetsAt: endMs,
      timeZone: config.timeZone,
    };
  }

  function listDocuments(): DocumentListView {
    const now = clock.now();
    const all = db
      .prepare('SELECT id, title, type, pages, supersedes_id FROM documents')
      .all() as DocumentRow[];
    const byId = new Map(all.map((doc) => [doc.id, doc]));
    const uploadedAt = new Map(
      (db.prepare('SELECT id, uploaded_at FROM documents').all() as { id: string; uploaded_at: number }[]).map(
        (row) => [row.id, row.uploaded_at],
      ),
    );
    const replaced = new Set(all.map((doc) => doc.supersedes_id).filter((id) => id !== null));
    const heads = all
      .filter((doc) => !replaced.has(doc.id))
      .sort((a, b) => (uploadedAt.get(b.id) ?? 0) - (uploadedAt.get(a.id) ?? 0) || (a.id < b.id ? -1 : 1));

    const documents: DocumentListItemView[] = [];
    for (const head of heads) {
      // The head, then the versions it replaced, newest first.
      for (let doc: DocumentRow | undefined = head; doc; doc = doc.supersedes_id ? byId.get(doc.supersedes_id) : undefined) {
        documents.push({
          documentId: doc.id,
          title: doc.title,
          type: doc.type,
          pages: doc.pages,
          supersededBy: supersededBy(doc.id),
          state: stateOf(doc.id, now),
        });
      }
    }
    return { documents, serverTime: now };
  }

  return { newestVersionId, supersededBy, latestReview, planUsage, listLawyers, getQuota, listDocuments };
}
