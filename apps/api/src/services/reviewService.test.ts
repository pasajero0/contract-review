import { beforeEach, describe, expect, it } from 'vitest';
import { FixedRandom } from '../adapters/fixedRandom.ts';
import { ManualClock } from '../adapters/manualClock.ts';
import { openDatabase, type Db } from '../db/connection.ts';
import { DEFAULT_CONFIG } from '../domain/config.ts';
import { createReviewService, type ReviewService, type StartedReview } from './reviewService.ts';

const NOV_15 = Date.UTC(2026, 10, 15, 12);
const OCT_15 = Date.UTC(2026, 9, 15, 12);
const TIMEOUT = DEFAULT_CONFIG.reviewTimeoutMs;
const FINDING = { clause: '1.1', title: 'Title', severity: 'high', excerpt: 'Text', explanation: 'Why' } as const;

let db: Db;
let clock: ManualClock;
let logs: string[];
let started: StartedReview[];
let service: ReviewService;
let pastReviews = 0;
let random: FixedRandom;

function newId(result: ReturnType<ReviewService['requestReview']>): string {
  if (!result.ok) throw new Error(`Expected a review, got ${result.code}`);
  return result.review.reviewId;
}

function row(id: string): { status: string; failure_reason: string | null; finished_at: number | null } {
  return db
    .prepare('SELECT status, failure_reason, finished_at FROM reviews WHERE id = ?')
    .get(id) as { status: string; failure_reason: string | null; finished_at: number | null };
}

function findingsCount(id: string): number {
  const found = db.prepare('SELECT count(*) AS n FROM findings WHERE review_id = ?').get(id) as { n: number };
  return found.n;
}

/** Adds documents and past reviews directly: the plan tests need many of them. */
function addDocument(id: string, supersedes: string | null = null): void {
  db.prepare(
    `INSERT INTO documents (id, title, type, pages, uploaded_at, uploaded_by, supersedes_id)
     VALUES (?, ?, 'nda', 1, 1, 'lawyer-1', ?)`,
  ).run(id, id, supersedes);
}

function addReview(status: 'completed' | 'failed' | 'running', requestedAt: number): void {
  pastReviews += 1;
  const id = `past-${pastReviews}`;
  const documentId = `doc-${id}`;
  addDocument(documentId);
  db.prepare(
    `INSERT INTO reviews (id, document_id, requested_by, requested_at, deadline_at, status, failure_reason, finished_at)
     VALUES (?, ?, 'lawyer-1', ?, ?, ?, ?, ?)`,
  ).run(
    id,
    documentId,
    requestedAt,
    requestedAt + TIMEOUT,
    status,
    status === 'failed' ? 'ai_error' : null,
    status === 'running' ? null : requestedAt + 1,
  );
}

beforeEach(() => {
  db = openDatabase();
  db.exec(`INSERT INTO lawyers (id, name, title) VALUES ('lawyer-1', 'Riccardo Fanti', 'Partner'),
                                                       ('lawyer-2', 'Sofia Greco', 'Trainee')`);
  addDocument('doc-1');
  addDocument('doc-2');
  clock = new ManualClock(NOV_15);
  random = new FixedRandom();
  logs = [];
  started = [];
  service = createReviewService(
    {
      db,
      clock,
      random,
      config: DEFAULT_CONFIG,
      logger: { warn: (message) => logs.push(message) },
    },
    { onStarted: (review) => started.push(review) },
  );
});

describe('requestReview', () => {
  it('creates a running review with a deadline', () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));

    expect(service.getReview(id)).toMatchObject({
      status: 'running',
      findingsCount: 0,
      requestedAt: NOV_15,
      deadlineAt: NOV_15 + TIMEOUT,
      failureReason: null,
      serverTime: NOV_15,
    });
  });

  it('starts the runner only after the transaction has committed', () => {
    let visibleWhenStarted = false;
    const checking = createReviewService(
      {
        db,
        clock,
        random: new FixedRandom(),
        config: DEFAULT_CONFIG,
        logger: { warn: () => {} },
      },
      {
        onStarted: () => {
          // A transaction still open here would make BEGIN fail.
          db.exec('BEGIN IMMEDIATE');
          db.exec('ROLLBACK');
          visibleWhenStarted = true;
        },
      },
    );

    checking.requestReview('doc-1', 'lawyer-1');

    expect(visibleWhenStarted).toBe(true);
  });

  it('does not start the runner when the request is rejected', () => {
    service.requestReview('doc-1', 'lawyer-1');
    started.length = 0;

    service.requestReview('doc-1', 'lawyer-2');

    expect(started).toEqual([]);
  });

  it('rejects a second request while one is running, saying who started it and when', () => {
    service.requestReview('doc-1', 'lawyer-1');

    expect(service.requestReview('doc-1', 'lawyer-2')).toEqual({
      ok: false,
      code: 'review_in_progress',
      startedBy: 'Riccardo Fanti',
      startedAt: NOV_15,
    });
  });

  it('rejects a document that does not exist', () => {
    expect(service.requestReview('missing', 'lawyer-1')).toEqual({ ok: false, code: 'document_not_found' });
  });

  it('rejects a lawyer that does not exist', () => {
    expect(service.requestReview('doc-1', 'missing')).toEqual({ ok: false, code: 'lawyer_not_found' });
  });

  it('rejects a superseded document and names the current version', () => {
    addDocument('doc-1-v2', 'doc-1');

    expect(service.requestReview('doc-1', 'lawyer-1')).toEqual({
      ok: false,
      code: 'document_superseded',
      currentVersionId: 'doc-1-v2',
    });
  });

  it('leaves no transaction open after a rejection', () => {
    service.requestReview('missing', 'lawyer-1');

    expect(() => newId(service.requestReview('doc-1', 'lawyer-1'))).not.toThrow();
  });
});

describe('plan', () => {
  it('rejects the 11th request with 10 completed this month, with the reset date', () => {
    for (let i = 0; i < 10; i += 1) addReview('completed', NOV_15 - 1000);

    expect(service.requestReview('doc-1', 'lawyer-1')).toEqual({
      ok: false,
      code: 'plan_exhausted',
      resetsAt: Date.UTC(2026, 10, 30, 23),
    });
  });

  it('rejects with 9 completed and 1 running: the running one holds a slot', () => {
    for (let i = 0; i < 9; i += 1) addReview('completed', NOV_15 - 1000);
    addReview('running', NOV_15 - 1000);

    expect(service.requestReview('doc-1', 'lawyer-1')).toMatchObject({ ok: false, code: 'plan_exhausted' });
  });

  it('does not count failed reviews', () => {
    for (let i = 0; i < 10; i += 1) addReview('failed', NOV_15 - 1000);

    expect(service.requestReview('doc-1', 'lawyer-1')).toMatchObject({ ok: true });
  });

  it('does not count a running review past its deadline', () => {
    for (let i = 0; i < 9; i += 1) addReview('completed', NOV_15 - 1000);
    addReview('running', NOV_15 - TIMEOUT);

    expect(service.requestReview('doc-1', 'lawyer-1')).toMatchObject({ ok: true });
  });

  it('does not count last month', () => {
    for (let i = 0; i < 10; i += 1) addReview('completed', OCT_15);

    expect(service.requestReview('doc-1', 'lawyer-1')).toMatchObject({ ok: true });
  });

  it('uses the workspace time zone for the month boundary', () => {
    // 31 Oct 23:30 UTC is already November in Rome (00:30) and in Sofia (01:30).
    // 31 Oct 22:30 UTC is October in Rome (23:30) but November in Sofia (00:30).
    for (let i = 0; i < 10; i += 1) addReview('completed', Date.UTC(2026, 9, 31, 22, 30));
    const now = Date.UTC(2026, 9, 31, 23, 30);
    const build = (timeZone: string) =>
      createReviewService(
        {
          db,
          clock: new ManualClock(now),
          random: new FixedRandom(),
          config: { ...DEFAULT_CONFIG, timeZone },
          logger: { warn: () => {} },
        },
        { onStarted: () => {} },
      );

    expect(build('Europe/Sofia').requestReview('doc-1', 'lawyer-1')).toMatchObject({
      ok: false,
      code: 'plan_exhausted',
    });
    expect(build('Europe/Rome').requestReview('doc-1', 'lawyer-1')).toMatchObject({ ok: true });
  });

  it('counts a review by request time, not by finish time', async () => {
    // Requested at 23:59:30 on 31 October in Rome, finished in November: it counts for October.
    const lateClock = new ManualClock(Date.UTC(2026, 9, 31, 22, 59, 30));
    const lateService = createReviewService(
      { db, clock: lateClock, random, config: DEFAULT_CONFIG, logger: { warn: () => {} } },
      { onStarted: () => {} },
    );
    const id = newId(lateService.requestReview('doc-1', 'lawyer-1'));
    await lateClock.advance(40_000);
    expect(lateService.complete(id)).toBe(true);
    for (let i = 0; i < 9; i += 1) addReview('completed', NOV_15 - 1000);

    expect(service.requestReview('doc-2', 'lawyer-1')).toMatchObject({ ok: true });
  });

  it('gives the last slot to exactly one of two documents requested together', () => {
    for (let i = 0; i < 9; i += 1) addReview('completed', NOV_15 - 1000);

    const results = [
      service.requestReview('doc-1', 'lawyer-1'),
      service.requestReview('doc-2', 'lawyer-2'),
    ];

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toMatchObject([{ code: 'plan_exhausted' }]);
  });
});

describe('late events', () => {
  it('stores a finding before the deadline', () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));

    expect(service.recordFinding(id, FINDING)).toBe(true);
    expect(service.recordFinding(id, FINDING)).toBe(true);

    expect(service.getReview(id)?.findingsCount).toBe(2);
    expect(db.prepare('SELECT seq FROM findings ORDER BY seq').all()).toEqual([{ seq: 1 }, { seq: 2 }]);
  });

  it('drops and logs a finding after the deadline', async () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    await clock.advance(TIMEOUT + 4000);

    expect(service.recordFinding(id, FINDING)).toBe(false);

    expect(findingsCount(id)).toBe(0);
    expect(logs).toEqual([expect.stringContaining('finding arrived 4s after deadline, dropped')]);
  });

  it('drops and logs a finding with an unknown severity', () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));

    expect(service.recordFinding(id, { ...FINDING, severity: 'critical' })).toBe(false);

    expect(findingsCount(id)).toBe(0);
    expect(logs).toEqual([expect.stringContaining('unknown severity')]);
  });

  it('completes before the deadline', () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));

    expect(service.complete(id)).toBe(true);

    expect(row(id)).toEqual({ status: 'completed', failure_reason: null, finished_at: NOV_15 });
  });

  it('drops a completion after the deadline, does not complete and does not use the plan', async () => {
    for (let i = 0; i < 9; i += 1) addReview('completed', NOV_15 - 1000);
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    await clock.advance(TIMEOUT + 4000);

    expect(service.complete(id)).toBe(false);

    expect(row(id).status).toBe('running');
    expect(logs).toEqual([expect.stringContaining('completion arrived 4s after deadline, dropped')]);
    expect(service.requestReview('doc-2', 'lawyer-1')).toMatchObject({ ok: true });
  });

  it('drops a completion exactly at the deadline', async () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    await clock.advance(TIMEOUT);

    expect(service.complete(id)).toBe(false);
  });

  it('drops a failure after the deadline', async () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    await clock.advance(TIMEOUT + 1);

    expect(service.fail(id, 'ai_error')).toBe(false);

    expect(row(id).failure_reason).toBeNull();
  });

  it('drops a failure exactly at the deadline', async () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    await clock.advance(TIMEOUT);

    expect(service.fail(id, 'ai_error')).toBe(false);

    expect(row(id).failure_reason).toBeNull();
  });

  it('drops events for a review that has already finished', () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    service.fail(id, 'ai_error');

    expect(service.complete(id)).toBe(false);
    expect(service.recordFinding(id, FINDING)).toBe(false);

    expect(row(id).status).toBe('failed');
    expect(logs).toHaveLength(2);
  });

  it('does not throw on an event for an unknown review', () => {
    expect(service.complete('missing')).toBe(false);
    expect(service.recordFinding('missing', FINDING)).toBe(false);
    expect(service.fail('missing', 'ai_error')).toBe(false);
  });
});

describe('expiry', () => {
  it('persists an overdue review as failed at its deadline', async () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    await clock.advance(TIMEOUT + 5000);

    expect(service.expireOverdue()).toBe(1);

    expect(row(id)).toEqual({ status: 'failed', failure_reason: 'timeout', finished_at: NOV_15 + TIMEOUT });
  });

  it('expires nothing before the deadline', async () => {
    service.requestReview('doc-1', 'lawyer-1');
    await clock.advance(TIMEOUT - 1);

    expect(service.expireOverdue()).toBe(0);
  });

  it('shows an overdue review as failed on read, before anything persists it', async () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    await clock.advance(TIMEOUT);

    expect(service.getReview(id)).toMatchObject({ status: 'failed', failureReason: 'timeout' });
    expect(row(id).status).toBe('running');
  });

  it('does not let an overdue running review block a new request', async () => {
    const first = newId(service.requestReview('doc-1', 'lawyer-1'));
    await clock.advance(TIMEOUT);

    const second = newId(service.requestReview('doc-1', 'lawyer-2'));

    expect(row(first)).toMatchObject({ status: 'failed', failure_reason: 'timeout' });
    expect(row(second).status).toBe('running');
  });

  it('creates a new review on retry; the old one stays failed', () => {
    const first = newId(service.requestReview('doc-1', 'lawyer-1'));
    service.fail(first, 'ai_error');

    const second = newId(service.requestReview('doc-1', 'lawyer-1'));

    expect(second).not.toBe(first);
    expect(row(first)).toMatchObject({ status: 'failed', failure_reason: 'ai_error' });
    expect(row(second).status).toBe('running');
  });

  it('returns nothing for an unknown review', () => {
    expect(service.getReview('missing')).toBeNull();
  });
});
