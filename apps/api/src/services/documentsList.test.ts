import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { FixedRandom } from '../adapters/fixedRandom.ts';
import { ManualClock } from '../adapters/manualClock.ts';
import { openDatabase, type Db } from '../db/connection.ts';
import { seed } from '../db/seed.ts';
import { DEFAULT_CONFIG, type Config } from '../domain/config.ts';
import { createReviewService, type ReviewService } from './reviewService.ts';

const SAMPLES_DIR = fileURLToPath(new URL('../../../../samples/', import.meta.url));
const NOV_15 = Date.UTC(2026, 10, 15, 12);
const OCT_15 = Date.UTC(2026, 9, 15, 12);
const SEP_15 = Date.UTC(2026, 8, 15, 12);
// 2026-10-31 23:30 in Rome (UTC+1 after the clock change on 25 October).
const OCT_31_LOCAL_2330 = Date.UTC(2026, 9, 31, 22, 30);
const NOV_1_LOCAL_MIDNIGHT = Date.UTC(2026, 9, 31, 23);
const TIMEOUT = DEFAULT_CONFIG.reviewTimeoutMs;

let db: Db;
let clock: ManualClock;
let service: ReviewService;
let pastReviews = 0;

function build(config: Config = DEFAULT_CONFIG): ReviewService {
  return createReviewService(
    { db, clock, random: new FixedRandom(), config, logger: { warn: () => {} } },
    { onStarted: () => {} },
  );
}

function newId(result: ReturnType<ReviewService['requestReview']>): string {
  if (!result.ok) throw new Error(`Expected a review, got ${result.code}`);
  return result.review.reviewId;
}

function addDocument(id: string, uploadedAt = 1, supersedes: string | null = null): void {
  db.prepare(
    `INSERT INTO documents (id, title, type, pages, uploaded_at, uploaded_by, supersedes_id)
     VALUES (?, ?, 'nda', 3, ?, 'lawyer-1', ?)`,
  ).run(id, `Title ${id}`, uploadedAt, supersedes);
}

/** Adds a past review on its own document: the quota tests need many of them. */
function addReview(status: 'completed' | 'failed' | 'running', requestedAt: number): void {
  pastReviews += 1;
  const id = `past-${pastReviews}`;
  addDocument(`doc-${id}`);
  db.prepare(
    `INSERT INTO reviews (id, document_id, requested_by, requested_at, deadline_at, status, failure_reason, finished_at)
     VALUES (?, ?, 'lawyer-1', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    `doc-${id}`,
    requestedAt,
    requestedAt + TIMEOUT,
    status,
    status === 'failed' ? 'ai_error' : null,
    status === 'running' ? null : requestedAt + 1,
  );
}

function finding(severity: 'high' | 'medium' | 'low', n = 1) {
  return { clause: `${n}.1`, title: `T${n}`, severity, excerpt: 'E', explanation: 'X' } as const;
}

function stateOf(documentId: string) {
  const item = service.listDocuments().documents.find((doc) => doc.documentId === documentId);
  if (!item) throw new Error(`${documentId} is not listed`);
  return item.state;
}

beforeEach(() => {
  db = openDatabase();
  db.exec(`INSERT INTO lawyers (id, name, title) VALUES ('lawyer-1', 'Riccardo Fanti', 'Partner'),
                                                       ('lawyer-2', 'Sofia Greco', 'Trainee')`);
  addDocument('doc-1');
  addDocument('doc-2');
  clock = new ManualClock(NOV_15);
  pastReviews = 0;
  service = build();
});

describe('listLawyers', () => {
  it('documents-list AC-1: returns the seeded lawyers with id, name and title', () => {
    expect(service.listLawyers()).toEqual(
      expect.arrayContaining([
        { id: 'lawyer-1', name: 'Riccardo Fanti', title: 'Partner' },
        { id: 'lawyer-2', name: 'Sofia Greco', title: 'Trainee' },
      ]),
    );
    expect(service.listLawyers()).toHaveLength(2);
  });
});

describe('listDocuments', () => {
  it('documents-list AC-2: lists every document with its fields and the clock time', () => {
    const result = service.listDocuments();

    expect(result.serverTime).toBe(NOV_15);
    expect(result.documents.map((doc) => doc.documentId).sort()).toEqual(['doc-1', 'doc-2']);
    expect(result.documents.find((doc) => doc.documentId === 'doc-1')).toEqual({
      documentId: 'doc-1',
      title: 'Title doc-1',
      type: 'nda',
      pages: 3,
      supersededBy: null,
      state: { kind: 'not_reviewed' },
    });
  });

  it('documents-list AC-2: the state names who requested the latest review and when, not the first one', async () => {
    const first = newId(service.requestReview('doc-1', 'lawyer-1'));
    service.fail(first, 'ai_error');
    await clock.advance(5000);
    const second = newId(service.requestReview('doc-1', 'lawyer-2'));

    expect(stateOf('doc-1')).toEqual({
      kind: 'in_progress',
      reviewId: second,
      requestedBy: 'Sofia Greco',
      requestedAt: NOV_15 + 5000,
      deadlineAt: NOV_15 + 5000 + TIMEOUT,
      findingsCount: 0,
    });
  });

  it('documents-list AC-3: a document with no reviews is not_reviewed', () => {
    expect(stateOf('doc-1')).toEqual({ kind: 'not_reviewed' });
  });

  it('documents-list AC-4: a running review gives in_progress with the findings so far and the deadline', async () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    service.recordFinding(id, finding('high', 1));
    service.recordFinding(id, finding('low', 2));
    await clock.advance(3000);

    expect(stateOf('doc-1')).toEqual({
      kind: 'in_progress',
      reviewId: id,
      requestedBy: 'Riccardo Fanti',
      requestedAt: NOV_15,
      deadlineAt: NOV_15 + TIMEOUT,
      findingsCount: 2,
    });
    expect(service.listDocuments().serverTime).toBe(NOV_15 + 3000);
  });

  it('documents-list AC-5: a completed latest review gives the findings count and the high count', () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-2'));
    service.recordFinding(id, finding('high', 1));
    service.recordFinding(id, finding('medium', 2));
    service.recordFinding(id, finding('high', 3));
    service.complete(id);

    expect(stateOf('doc-1')).toEqual({
      kind: 'completed',
      reviewId: id,
      requestedBy: 'Sofia Greco',
      requestedAt: NOV_15,
      findingsCount: 3,
      highCount: 2,
    });
  });

  it('documents-list AC-5: the other documents keep their own state', () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    service.complete(id);

    expect(stateOf('doc-2')).toEqual({ kind: 'not_reviewed' });
  });

  it('documents-list AC-7: a superseded version names the newest version of its chain and its date', () => {
    addDocument('v1', 100);
    addDocument('v2', 200, 'v1');
    addDocument('v3', 300, 'v2');

    const items = service.listDocuments().documents;
    const by = (id: string) => items.find((doc) => doc.documentId === id)?.supersededBy;

    expect(by('v1')).toEqual({ documentId: 'v3', uploadedAt: 300 });
    expect(by('v2')).toEqual({ documentId: 'v3', uploadedAt: 300 });
    expect(by('v3')).toBeNull();
    expect(by('doc-1')).toBeNull();
  });

  it('documents-list AC-7: each version follows the one that replaced it; current versions go newest first, ties by id', () => {
    addDocument('v1', 100);
    addDocument('v2', 200, 'v1');
    addDocument('v3', 300, 'v2');
    addDocument('newest', 400);
    addDocument('tie-b', 250);
    addDocument('tie-a', 250);
    db.prepare('UPDATE documents SET uploaded_at = 150 WHERE id IN (?, ?)').run('doc-1', 'doc-2');

    expect(service.listDocuments().documents.map((doc) => doc.documentId)).toEqual([
      'newest',
      'v3',
      'v2',
      'v1',
      'tie-a',
      'tie-b',
      'doc-1',
      'doc-2',
    ]);
  });

  it('documents-list AC-9: a failed latest review gives the reason and count, and no latestCompleted when none exists', () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    service.recordFinding(id, finding('high', 1));
    service.fail(id, 'ai_error');

    expect(stateOf('doc-1')).toEqual({
      kind: 'failed',
      reviewId: id,
      requestedBy: 'Riccardo Fanti',
      requestedAt: NOV_15,
      failureReason: 'ai_error',
      findingsCount: 1,
      latestCompleted: null,
    });
  });

  it('documents-list AC-9: an ai_error after a completed review is still failed, and carries the completed one', async () => {
    const first = newId(service.requestReview('doc-1', 'lawyer-1'));
    service.recordFinding(first, finding('high', 1));
    service.recordFinding(first, finding('high', 2));
    service.recordFinding(first, finding('low', 3));
    service.complete(first);
    await clock.advance(1000);
    const second = newId(service.requestReview('doc-1', 'lawyer-2'));
    service.recordFinding(second, finding('medium', 1));
    service.fail(second, 'ai_error');

    expect(stateOf('doc-1')).toEqual({
      kind: 'failed',
      reviewId: second,
      requestedBy: 'Sofia Greco',
      requestedAt: NOV_15 + 1000,
      failureReason: 'ai_error',
      findingsCount: 1,
      latestCompleted: {
        reviewId: first,
        requestedBy: 'Riccardo Fanti',
        requestedAt: NOV_15,
        findingsCount: 3,
        highCount: 2,
      },
    });
  });

  it('documents-list AC-10: a running review past its deadline is failed / timeout, and the row stays running', async () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    await clock.advance(TIMEOUT);

    expect(stateOf('doc-1')).toMatchObject({
      kind: 'failed',
      reviewId: id,
      failureReason: 'timeout',
      findingsCount: 0,
      latestCompleted: null,
    });
    expect(db.prepare('SELECT status FROM reviews WHERE id = ?').get(id)).toEqual({ status: 'running' });
  });

  it('documents-list AC-10: a running review one millisecond before its deadline is still in progress', async () => {
    newId(service.requestReview('doc-1', 'lawyer-1'));
    await clock.advance(TIMEOUT - 1);

    expect(stateOf('doc-1')).toMatchObject({ kind: 'in_progress' });
  });

  it('documents-list AC-11: a completed review with no findings is completed with 0, not not_reviewed', () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    service.complete(id);

    expect(stateOf('doc-1')).toEqual({
      kind: 'completed',
      reviewId: id,
      requestedBy: 'Riccardo Fanti',
      requestedAt: NOV_15,
      findingsCount: 0,
      highCount: 0,
    });
  });
});

describe('getQuota', () => {
  function addMonthOfReviews(at: number): void {
    for (let i = 0; i < 3; i += 1) addReview('completed', at - 1000);
    addReview('running', at - 1000);
    addReview('failed', at - 1000);
    addReview('running', at - TIMEOUT); // overdue: holds no slot
    for (let i = 0; i < 2; i += 1) addReview('completed', at - 40 * 24 * 3600 * 1000); // earlier months
  }

  it('documents-list AC-6: counts completed, running (not overdue) and the rest of the plan this month', () => {
    addMonthOfReviews(NOV_15);
    for (let i = 0; i < 2; i += 1) addReview('completed', OCT_15);

    expect(service.getQuota()).toEqual({
      limit: 10,
      used: 3,
      running: 1,
      remaining: 6,
      month: '2026-11',
      resetsAt: Date.UTC(2026, 10, 30, 23),
      timeZone: 'Europe/Rome',
    });
  });

  it('documents-list AC-6: a fresh workspace has the whole plan left', () => {
    expect(service.getQuota()).toMatchObject({ limit: 10, used: 0, running: 0, remaining: 10 });
  });

  it('documents-list AC-6: the month and the reset come from the workspace time zone, near a month boundary', () => {
    clock = new ManualClock(OCT_31_LOCAL_2330);
    service = build();
    addReview('completed', SEP_15);
    addReview('completed', OCT_31_LOCAL_2330 - 1000);

    expect(service.getQuota()).toEqual({
      limit: 10,
      used: 1,
      running: 0,
      remaining: 9,
      month: '2026-10',
      resetsAt: NOV_1_LOCAL_MIDNIGHT,
      timeZone: 'Europe/Rome',
    });
  });

  it('documents-list AC-6: half an hour later the month has turned and the count starts again', async () => {
    clock = new ManualClock(OCT_31_LOCAL_2330);
    service = build();
    addReview('completed', OCT_31_LOCAL_2330 - 1000);
    await clock.advance(31 * 60 * 1000);

    expect(service.getQuota()).toMatchObject({ used: 0, remaining: 10, month: '2026-11' });
  });

  it('documents-list AC-6: timeZone is the configured one', () => {
    service = build({ ...DEFAULT_CONFIG, timeZone: 'UTC', planLimit: 4 });

    expect(service.getQuota()).toEqual({
      limit: 4,
      used: 0,
      running: 0,
      remaining: 4,
      month: '2026-11',
      resetsAt: Date.UTC(2026, 11, 1),
      timeZone: 'UTC',
    });
  });

  it('documents-list AC-6: remaining equals canRequest.remaining for a free document, on a fresh plan', () => {
    const canRequest = service.getDocument('doc-1')?.canRequest;

    expect(canRequest).toEqual({ allowed: true, remaining: 10 });
    expect(service.getQuota().remaining).toBe(10);
  });

  it('documents-list AC-6: remaining equals canRequest.remaining for a free document, in a busy month', () => {
    addMonthOfReviews(NOV_15);
    const canRequest = service.getDocument('doc-1')?.canRequest;

    expect(canRequest).toEqual({ allowed: true, remaining: 6 });
    expect(service.getQuota().remaining).toBe(6);
  });

  it('documents-list AC-6: a used-up plan has remaining 0 where canRequest says plan_exhausted', () => {
    for (let i = 0; i < 10; i += 1) addReview('completed', NOV_15 - 1000);

    expect(service.getQuota()).toMatchObject({ used: 10, remaining: 0 });
    expect(service.getDocument('doc-1')?.canRequest).toMatchObject({ allowed: false, reason: 'plan_exhausted' });
  });

  it('documents-list AC-6: a running review of a real request takes a slot', () => {
    newId(service.requestReview('doc-1', 'lawyer-1'));

    expect(service.getQuota()).toMatchObject({ used: 0, running: 1, remaining: 9 });
  });
});

describe('the real samples', () => {
  it('documents-list AC-12: after the seed there are 3 lawyers, 13 documents, and exactly 1 superseded', () => {
    db = openDatabase();
    seed(db, SAMPLES_DIR);
    clock = new ManualClock(NOV_15);
    service = build();

    const documents = service.listDocuments().documents;

    expect(service.listLawyers()).toHaveLength(3);
    expect(documents).toHaveLength(13);
    expect(documents.filter((doc) => doc.supersededBy !== null)).toHaveLength(1);
    expect(documents.filter((doc) => doc.supersededBy === null)).toHaveLength(12);
    expect(documents.every((doc) => doc.state.kind === 'not_reviewed')).toBe(true);
  });
});
