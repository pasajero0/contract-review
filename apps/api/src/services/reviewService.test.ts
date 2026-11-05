import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { FixedRandom } from '../adapters/fixedRandom.ts';
import { ManualClock } from '../adapters/manualClock.ts';
import { openDatabase, type Db } from '../db/connection.ts';
import { DEFAULT_CONFIG } from '../domain/config.ts';
import { createReviewService, type ReviewService, type StartedReview } from './reviewService.ts';

const SAMPLES_DIR = fileURLToPath(new URL('../../../../samples/', import.meta.url));
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
  it('request-review AC-1: creates a running review with a +60 s deadline', () => {
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

  it('request-review AC-2: starts the runner only after the transaction has committed', () => {
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

  it('request-review AC-8: rejects a second request while one is running, saying who started it and when', () => {
    service.requestReview('doc-1', 'lawyer-1');

    expect(service.requestReview('doc-1', 'lawyer-2')).toEqual({
      ok: false,
      code: 'review_in_progress',
      startedBy: 'Riccardo Fanti',
      startedAt: NOV_15,
    });
  });

  it('request-review AC-10: rejects a document that does not exist', () => {
    expect(service.requestReview('missing', 'lawyer-1')).toEqual({ ok: false, code: 'document_not_found' });
  });

  it('rejects a lawyer that does not exist', () => {
    expect(service.requestReview('doc-1', 'missing')).toEqual({ ok: false, code: 'lawyer_not_found' });
  });

  it('request-review AC-10: rejects a superseded document and names the current version', () => {
    addDocument('doc-1-v2', 'doc-1');

    expect(service.requestReview('doc-1', 'lawyer-1')).toEqual({
      ok: false,
      code: 'document_superseded',
      currentVersionId: 'doc-1-v2',
    });
  });

  it('request-review AC-1: a failed insert rolls the whole request back, and the runner does not start', async () => {
    const first = newId(service.requestReview('doc-1', 'lawyer-1'));
    started.length = 0;
    await clock.advance(TIMEOUT + 1000);
    // Every uuid() is the id of the existing review, so the INSERT collides on the primary key.
    const colliding = createReviewService(
      {
        db,
        clock,
        random: { next: () => 0, uuid: () => first },
        config: DEFAULT_CONFIG,
        logger: { warn: () => {} },
      },
      { onStarted: (review) => started.push(review) },
    );

    expect(() => colliding.requestReview('doc-1', 'lawyer-2')).toThrow();

    // The expiry done inside the transaction was rolled back with it.
    expect(row(first)).toEqual({ status: 'running', failure_reason: null, finished_at: null });
    expect(db.prepare('SELECT count(*) AS n FROM reviews').get()).toEqual({ n: 1 });
    expect(started).toEqual([]);
    // No transaction was left open.
    expect(() => newId(service.requestReview('doc-2', 'lawyer-1'))).not.toThrow();
  });

  it('leaves no transaction open after a rejection', () => {
    service.requestReview('missing', 'lawyer-1');

    expect(() => newId(service.requestReview('doc-1', 'lawyer-1'))).not.toThrow();
  });
});

describe('plan', () => {
  it('request-review AC-9: rejects the 11th request with 10 completed this month, with the reset date', () => {
    for (let i = 0; i < 10; i += 1) addReview('completed', NOV_15 - 1000);

    expect(service.requestReview('doc-1', 'lawyer-1')).toEqual({
      ok: false,
      code: 'plan_exhausted',
      resetsAt: Date.UTC(2026, 10, 30, 23),
    });
  });

  it('request-review AC-9: rejects with 9 completed and 1 running: the running one holds a slot', () => {
    for (let i = 0; i < 9; i += 1) addReview('completed', NOV_15 - 1000);
    addReview('running', NOV_15 - 1000);

    expect(service.requestReview('doc-1', 'lawyer-1')).toMatchObject({ ok: false, code: 'plan_exhausted' });
  });

  it('request-review AC-18: does not count failed reviews', () => {
    for (let i = 0; i < 10; i += 1) addReview('failed', NOV_15 - 1000);

    expect(service.requestReview('doc-1', 'lawyer-1')).toMatchObject({ ok: true });
  });

  it('request-review AC-13: does not count a running review past its deadline, so its slot is free', () => {
    for (let i = 0; i < 9; i += 1) addReview('completed', NOV_15 - 1000);
    addReview('running', NOV_15 - TIMEOUT);

    expect(service.requestReview('doc-1', 'lawyer-1')).toMatchObject({ ok: true });
  });

  it('request-review AC-19: does not count last month', () => {
    for (let i = 0; i < 10; i += 1) addReview('completed', OCT_15);

    expect(service.requestReview('doc-1', 'lawyer-1')).toMatchObject({ ok: true });
  });

  it('request-review AC-19: uses the workspace time zone for the month boundary', () => {
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

  it('request-review AC-19: counts a review by request time, not by finish time', async () => {
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

  it('request-review AC-16: of two requests for the last slot, made in sequence, exactly one is accepted', () => {
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

  it('request-review AC-14: drops and logs a finding after the deadline', async () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    await clock.advance(TIMEOUT + 4000);

    expect(service.recordFinding(id, FINDING)).toBe(false);

    expect(findingsCount(id)).toBe(0);
    expect(logs).toEqual([expect.stringContaining('finding arrived 4s after deadline, dropped')]);
  });

  it('request-review AC-12: drops and logs a finding with an unknown severity', () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));

    expect(service.recordFinding(id, { ...FINDING, severity: 'critical' })).toBe(false);

    expect(findingsCount(id)).toBe(0);
    expect(logs).toEqual([expect.stringContaining('unknown severity')]);
  });

  it('request-review AC-3: completes before the deadline', () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));

    expect(service.complete(id)).toBe(true);

    expect(row(id)).toEqual({ status: 'completed', failure_reason: null, finished_at: NOV_15 });
  });

  it('request-review AC-14: drops a completion after the deadline, does not complete and does not use the plan', async () => {
    for (let i = 0; i < 9; i += 1) addReview('completed', NOV_15 - 1000);
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    await clock.advance(TIMEOUT + 4000);

    expect(service.complete(id)).toBe(false);

    expect(row(id).status).toBe('running');
    expect(logs).toEqual([expect.stringContaining('completion arrived 4s after deadline, dropped')]);
    expect(service.requestReview('doc-2', 'lawyer-1')).toMatchObject({ ok: true });
  });

  it('request-review AC-14: drops a completion exactly at the deadline', async () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    await clock.advance(TIMEOUT);

    expect(service.complete(id)).toBe(false);
  });

  it('request-review AC-14: drops a failure after the deadline', async () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    await clock.advance(TIMEOUT + 1);

    expect(service.fail(id, 'ai_error')).toBe(false);

    expect(row(id).failure_reason).toBeNull();
  });

  it('request-review AC-14: logs a late failure with how late it was', async () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    await clock.advance(TIMEOUT + 4000);

    expect(service.fail(id, 'ai_error')).toBe(false);

    expect(logs).toEqual([expect.stringContaining('failure arrived 4s after deadline, dropped')]);
  });

  it('request-review AC-14: drops a failure exactly at the deadline', async () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    await clock.advance(TIMEOUT);

    expect(service.fail(id, 'ai_error')).toBe(false);

    expect(row(id).failure_reason).toBeNull();
  });

  it('request-review AC-14: drops events for a review that has already finished', () => {
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
  it('request-review AC-13: persists an overdue review as failed / timeout with finished_at = deadline', async () => {
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

  it('request-review AC-13: shows an overdue review as failed on read, before anything persists it', async () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    await clock.advance(TIMEOUT);

    expect(service.getReview(id)).toMatchObject({ status: 'failed', failureReason: 'timeout' });
    expect(row(id).status).toBe('running');
  });

  it('request-review AC-17: does not let an overdue running review block a new request', async () => {
    const first = newId(service.requestReview('doc-1', 'lawyer-1'));
    await clock.advance(TIMEOUT);

    const second = newId(service.requestReview('doc-1', 'lawyer-2'));

    expect(row(first)).toMatchObject({ status: 'failed', failure_reason: 'timeout' });
    expect(row(second).status).toBe('running');
  });

  it('request-review AC-5: creates a new review on retry; the old one stays failed', () => {
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

/** Adds a past review on a given document; unlike addReview, the document is not new. */
function addReviewOn(
  documentId: string,
  status: 'completed' | 'failed' | 'running',
  requestedAt: number,
  lawyerId = 'lawyer-1',
): string {
  pastReviews += 1;
  const id = `on-${pastReviews}`;
  db.prepare(
    `INSERT INTO reviews (id, document_id, requested_by, requested_at, deadline_at, status, failure_reason, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    documentId,
    lawyerId,
    requestedAt,
    requestedAt + TIMEOUT,
    status,
    status === 'failed' ? 'ai_error' : null,
    status === 'running' ? null : requestedAt + 1,
  );
  return id;
}

const RESETS_AT = Date.UTC(2026, 10, 30, 23);

describe('getDocument', () => {
  it('request-review AC-7: a document with no reviews can be requested, with the full plan left', () => {
    expect(service.getDocument('doc-1')).toMatchObject({
      documentId: 'doc-1',
      title: 'doc-1',
      type: 'nda',
      pages: 1,
      current: null,
      lastFailed: null,
      canRequest: { allowed: true, remaining: 10 },
      serverTime: NOV_15,
    });
  });

  it('request-review AC-7: serverTime follows the clock', async () => {
    await clock.advance(2500);

    expect(service.getDocument('doc-1')?.serverTime).toBe(NOV_15 + 2500);
  });

  it('request-review AC-7: remaining counts completed and non-overdue running reviews this month only', () => {
    for (let i = 0; i < 3; i += 1) addReview('completed', NOV_15 - 1000);
    addReview('running', NOV_15 - 1000);
    addReview('running', NOV_15 - TIMEOUT); // overdue: holds no slot
    addReview('failed', NOV_15 - 1000);
    for (let i = 0; i < 2; i += 1) addReview('completed', OCT_15);

    expect(service.getDocument('doc-1')?.canRequest).toEqual({ allowed: true, remaining: 6 });
  });

  it('request-review AC-7: remaining is 1 on the last slot', () => {
    for (let i = 0; i < 9; i += 1) addReview('completed', NOV_15 - 1000);

    expect(service.getDocument('doc-1')?.canRequest).toEqual({ allowed: true, remaining: 1 });
  });

  it('request-review AC-7: a running review shows who, when and the count, never finding content', async () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-2'));
    service.recordFinding(id, { ...FINDING, title: 'Distinctive-Title-9921', explanation: 'Distinctive-Why-5530' });
    service.recordFinding(id, FINDING);
    await clock.advance(5000);

    const view = service.getDocument('doc-1');

    expect(view?.current).toEqual({
      reviewId: id,
      requestedBy: 'Sofia Greco',
      requestedAt: NOV_15,
      deadlineAt: NOV_15 + TIMEOUT,
      findingsCount: 2,
    });
    expect(view?.lastFailed).toBeNull();
    expect(view?.canRequest).toEqual({
      allowed: false,
      reason: 'review_in_progress',
      startedBy: 'Sofia Greco',
      startedAt: NOV_15,
    });
    expect(JSON.stringify(view)).not.toContain('Distinctive-Title-9921');
    expect(JSON.stringify(view)).not.toContain('Distinctive-Why-5530');
  });

  it('request-review AC-7: with 9 completed and 1 running elsewhere the plan is exhausted', () => {
    for (let i = 0; i < 9; i += 1) addReview('completed', NOV_15 - 1000);
    addReview('running', NOV_15 - 1000);

    expect(service.getDocument('doc-1')?.canRequest).toEqual({
      allowed: false,
      reason: 'plan_exhausted',
      limit: 10,
      resetsAt: RESETS_AT,
    });
  });

  it('request-review AC-7: with 10 used the plan is exhausted', () => {
    for (let i = 0; i < 10; i += 1) addReview('completed', NOV_15 - 1000);

    expect(service.getDocument('doc-1')?.canRequest).toEqual({
      allowed: false,
      reason: 'plan_exhausted',
      limit: 10,
      resetsAt: RESETS_AT,
    });
  });

  it('request-review AC-7: a superseded document says so, ahead of any other reason', () => {
    for (let i = 0; i < 10; i += 1) addReview('completed', NOV_15 - 1000);
    addReviewOn('doc-1', 'running', NOV_15 - 1000);
    addDocument('doc-1-v2', 'doc-1');

    expect(service.getDocument('doc-1')?.canRequest).toEqual({
      allowed: false,
      reason: 'document_superseded',
      currentVersionId: 'doc-1-v2',
    });
  });

  it('request-review AC-7: a failed review shows its reason and findings, and does not use the plan', () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    service.recordFinding(id, FINDING);
    service.recordFinding(id, FINDING);
    service.fail(id, 'ai_error');

    const view = service.getDocument('doc-1');

    expect(view?.current).toBeNull();
    expect(view?.lastFailed).toEqual({
      reviewId: id,
      requestedBy: 'Riccardo Fanti',
      requestedAt: NOV_15,
      failureReason: 'ai_error',
      findingsCount: 2,
    });
    expect(view?.canRequest).toEqual({ allowed: true, remaining: 10 });
  });

  it('request-review AC-13: an overdue running review reads as failed / timeout, and reading writes nothing', async () => {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    service.recordFinding(id, FINDING);
    await clock.advance(TIMEOUT);

    const view = service.getDocument('doc-1');

    expect(view?.current).toBeNull();
    expect(view?.lastFailed).toMatchObject({ reviewId: id, failureReason: 'timeout', findingsCount: 1 });
    expect(view?.canRequest).toEqual({ allowed: true, remaining: 10 });
    expect(row(id)).toEqual({ status: 'running', failure_reason: null, finished_at: null });
  });

  it('request-review AC-7: an older failure followed by a completed review shows no failure', async () => {
    const first = newId(service.requestReview('doc-1', 'lawyer-1'));
    service.fail(first, 'ai_error');
    await clock.advance(1000);
    const second = newId(service.requestReview('doc-1', 'lawyer-1'));
    service.complete(second);

    const view = service.getDocument('doc-1');

    expect(view?.lastFailed).toBeNull();
    expect(view?.current).toBeNull();
    expect(view?.canRequest).toEqual({ allowed: true, remaining: 9 });
  });

  it('request-review AC-7: an unknown document gives nothing', () => {
    expect(service.getDocument('missing')).toBeNull();
  });

  it('request-review AC-7: reading changes no row', () => {
    addReviewOn('doc-1', 'running', NOV_15 - TIMEOUT);
    const snapshot = () => JSON.stringify(db.prepare('SELECT * FROM reviews ORDER BY id').all());
    const before = snapshot();

    service.getDocument('doc-1');

    expect(snapshot()).toBe(before);
  });
});

describe('canRequest agrees with a real request', () => {
  const cases: Array<[string, () => void, string, boolean]> = [
    ['no reviews', () => {}, 'doc-1', true],
    ['the last slot', () => { for (let i = 0; i < 9; i += 1) addReview('completed', NOV_15 - 1000); }, 'doc-1', true],
    ['a running review on the document', () => { addReviewOn('doc-1', 'running', NOV_15 - 1000); }, 'doc-1', false],
    ['a running review on another document', () => { addReviewOn('doc-2', 'running', NOV_15 - 1000); }, 'doc-1', true],
    ['10 completed', () => { for (let i = 0; i < 10; i += 1) addReview('completed', NOV_15 - 1000); }, 'doc-1', false],
    [
      '9 completed and 1 running elsewhere',
      () => {
        for (let i = 0; i < 9; i += 1) addReview('completed', NOV_15 - 1000);
        addReview('running', NOV_15 - 1000);
      },
      'doc-1',
      false,
    ],
    ['10 completed last month', () => { for (let i = 0; i < 10; i += 1) addReview('completed', OCT_15); }, 'doc-1', true],
    ['a superseded document', () => { addDocument('doc-1-v2', 'doc-1'); }, 'doc-1', false],
    [
      'a superseded document with a used-up plan',
      () => {
        for (let i = 0; i < 10; i += 1) addReview('completed', NOV_15 - 1000);
        addDocument('doc-1-v2', 'doc-1');
      },
      'doc-1',
      false,
    ],
    ['10 failed reviews', () => { for (let i = 0; i < 10; i += 1) addReview('failed', NOV_15 - 1000); }, 'doc-1', true],
    ['a failed latest review', () => { addReviewOn('doc-1', 'failed', NOV_15 - 1000); }, 'doc-1', true],
    ['an overdue running review', () => { addReviewOn('doc-1', 'running', NOV_15 - TIMEOUT); }, 'doc-1', true],
    [
      'an overdue running review and 9 completed',
      () => {
        for (let i = 0; i < 9; i += 1) addReview('completed', NOV_15 - 1000);
        addReviewOn('doc-1', 'running', NOV_15 - TIMEOUT);
      },
      'doc-1',
      true,
    ],
    [
      'an old failure then a completed review',
      () => {
        addReviewOn('doc-1', 'failed', NOV_15 - 5000);
        addReviewOn('doc-1', 'completed', NOV_15 - 1000);
      },
      'doc-1',
      true,
    ],
    [
      'a chain v1, v2, v3: the oldest',
      () => { addDocument('v1'); addDocument('v2', 'v1'); addDocument('v3', 'v2'); },
      'v1',
      false,
    ],
    [
      'a chain v1, v2, v3: the middle',
      () => { addDocument('v1'); addDocument('v2', 'v1'); addDocument('v3', 'v2'); },
      'v2',
      false,
    ],
    [
      'a chain v1, v2, v3: the newest',
      () => { addDocument('v1'); addDocument('v2', 'v1'); addDocument('v3', 'v2'); },
      'v3',
      true,
    ],
  ];

  it.each(cases)('request-review AC-7: %s', (_name, setUp, documentId, expected) => {
    setUp();

    const view = service.getDocument(documentId);
    const result = service.requestReview(documentId, 'lawyer-1');

    expect(view?.canRequest.allowed).toBe(expected);
    expect(result.ok).toBe(expected);
    if (!result.ok && view && !view.canRequest.allowed) {
      expect(view.canRequest.reason).toBe(result.code);
    }
  });
});

describe('superseded chain', () => {
  beforeEach(() => {
    addDocument('v1');
    addDocument('v2', 'v1');
    addDocument('v3', 'v2');
  });

  it('request-review AC-10: a request on v1 names v3, the end of the chain', () => {
    expect(service.requestReview('v1', 'lawyer-1')).toEqual({
      ok: false,
      code: 'document_superseded',
      currentVersionId: 'v3',
    });
  });

  it('request-review AC-10: a request on v2 names v3', () => {
    expect(service.requestReview('v2', 'lawyer-1')).toEqual({
      ok: false,
      code: 'document_superseded',
      currentVersionId: 'v3',
    });
  });

  it('request-review AC-10: canRequest on v1 and v2 names v3 too', () => {
    const expected = { allowed: false, reason: 'document_superseded', currentVersionId: 'v3' };

    expect(service.getDocument('v1')?.canRequest).toEqual(expected);
    expect(service.getDocument('v2')?.canRequest).toEqual(expected);
  });
});

describe('getDocument: the result of a review', () => {
  type Incoming = Parameters<ReviewService['recordFinding']>[1];

  function finding(severity: string, clause: string | null, title: string): Incoming {
    return { clause, title, severity, excerpt: clause === null ? null : `Excerpt of ${title}`, explanation: `Why ${title}` };
  }

  /** A review through the service: findings recorded, then completed. */
  function completeReview(documentId: string, findings: Incoming[], lawyerId = 'lawyer-1'): string {
    const id = newId(service.requestReview(documentId, lawyerId));
    for (const item of findings) service.recordFinding(id, item);
    expect(service.complete(id)).toBe(true);
    return id;
  }

  function insertFinding(reviewId: string, seq: number, item: Incoming): void {
    db.prepare(
      `INSERT INTO findings (id, review_id, seq, clause, title, severity, excerpt, explanation, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    ).run(`f-${reviewId}-${seq}`, reviewId, seq, item.clause, item.title, item.severity, item.excerpt, item.explanation);
  }

  it('read-result AC-1: returns the completed review with who, when, counts and every finding field', async () => {
    const first = finding('high', '5.1', 'Uncapped');
    const second = finding('low', '2', 'Typo');
    const id = newId(service.requestReview('doc-1', 'lawyer-2'));
    service.recordFinding(id, first);
    service.recordFinding(id, second);
    await clock.advance(5000);
    service.complete(id);

    expect(service.getDocument('doc-1')?.latestCompleted).toEqual({
      reviewId: id,
      requestedBy: 'Sofia Greco',
      requestedAt: NOV_15,
      finishedAt: NOV_15 + 5000,
      counts: { high: 1, medium: 0, low: 1 },
      findings: [first, second],
    });
  });

  it('read-result AC-1: with two completed reviews, returns only the latest', async () => {
    completeReview('doc-1', [finding('high', '1', 'Old finding')]);
    await clock.advance(1000);
    const latest = completeReview('doc-1', [finding('medium', '2', 'New finding')], 'lawyer-2');

    const completed = service.getDocument('doc-1')?.latestCompleted;

    expect(completed?.reviewId).toBe(latest);
    expect(completed?.requestedBy).toBe('Sofia Greco');
    expect(completed?.counts).toEqual({ high: 0, medium: 1, low: 0 });
    expect(completed?.findings.map((item) => item.title)).toEqual(['New finding']);
  });

  it('read-result AC-1: a document never reviewed has no latestCompleted', () => {
    expect(service.getDocument('doc-1')?.latestCompleted).toBeNull();
  });

  it('read-result AC-2: sorts findings that arrive out of order', () => {
    completeReview('doc-1', [
      finding('low', '1', 'low 1'),
      finding('medium', '12.1', 'medium 12.1'),
      finding('high', '12.1', 'high 12.1'),
      finding('medium', '4.2', 'medium 4.2'),
      finding('high', '4.2', 'high 4.2'),
    ]);

    expect(service.getDocument('doc-1')?.latestCompleted?.findings.map((item) => item.title)).toEqual([
      'high 4.2',
      'high 12.1',
      'medium 4.2',
      'medium 12.1',
      'low 1',
    ]);
  });

  const SECRETS = ['Secret-Clause-8841', 'Secret-Title-8841', 'Secret-Excerpt-8841', 'Secret-Explanation-8841'];
  const SECRET_FINDING: Incoming = {
    clause: SECRETS[0] ?? '',
    title: SECRETS[1] ?? '',
    severity: 'high',
    excerpt: SECRETS[2] ?? '',
    explanation: SECRETS[3] ?? '',
  };

  /** Starts a review on doc-1, records the secret finding, and leaves it running, failed or overdue. */
  async function leaveUnfinished(kind: 'running' | 'ai_error' | 'timeout'): Promise<void> {
    const id = newId(service.requestReview('doc-1', 'lawyer-1'));
    service.recordFinding(id, SECRET_FINDING);
    if (kind === 'ai_error') service.fail(id, 'ai_error');
    if (kind === 'timeout') await clock.advance(TIMEOUT);
  }

  it.each(['running', 'ai_error', 'timeout'] as const)(
    'read-result AC-3: a %s review hides its findings: only the earlier completed review is shown',
    async (kind) => {
      const earlier = completeReview('doc-1', [finding('low', '1', 'Earlier finding')]);
      await clock.advance(1000);
      await leaveUnfinished(kind);

      const view = service.getDocument('doc-1');

      expect(view?.latestCompleted?.reviewId).toBe(earlier);
      expect(view?.latestCompleted?.findings.map((item) => item.title)).toEqual(['Earlier finding']);
      for (const secret of SECRETS) expect(JSON.stringify(view)).not.toContain(secret);
    },
  );

  it.each(['running', 'ai_error', 'timeout'] as const)(
    'read-result AC-3: a %s review with no earlier completed one gives null, and its findings appear nowhere',
    async (kind) => {
      await leaveUnfinished(kind);

      const view = service.getDocument('doc-1');

      expect(view?.latestCompleted).toBeNull();
      for (const secret of SECRETS) expect(JSON.stringify(view)).not.toContain(secret);
    },
  );

  it('read-result AC-5: a finding with no clause and no excerpt returns null for both and sorts last in its severity', () => {
    const nothing: Incoming = { clause: null, title: 'No DPA', severity: 'medium', excerpt: null, explanation: 'Missing' };
    completeReview('doc-1', [nothing, finding('medium', '30', 'medium 30'), finding('medium', '2', 'medium 2')]);

    const findings = service.getDocument('doc-1')?.latestCompleted?.findings;

    expect(findings?.map((item) => item.title)).toEqual(['medium 2', 'medium 30', 'No DPA']);
    expect(findings?.[2]).toEqual(nothing);
  });

  it('read-result AC-6: a completed review with no findings gives an empty list and zero counts, not null', () => {
    const id = completeReview('doc-1', []);

    expect(service.getDocument('doc-1')?.latestCompleted).toMatchObject({
      reviewId: id,
      counts: { high: 0, medium: 0, low: 0 },
      findings: [],
    });
    expect(service.getDocument('doc-2')?.latestCompleted).toBeNull();
  });

  describe('a chain v1, v2, v3', () => {
    beforeEach(() => {
      addDocument('v1');
      addDocument('v2', 'v1');
      addDocument('v3', 'v2');
      db.exec(`UPDATE documents SET uploaded_at = 1000 WHERE id = 'v1';
               UPDATE documents SET uploaded_at = 2000 WHERE id = 'v2';
               UPDATE documents SET uploaded_at = 3000 WHERE id = 'v3'`);
    });

    it('read-result AC-7: a superseded version keeps its completed review and names the newest version and its date', () => {
      // The finding goes in while the review runs: the database rejects one on a finished review.
      const reviewId = addReviewOn('v1', 'running', OCT_15);
      insertFinding(reviewId, 1, finding('high', '2.1', 'Old version finding'));
      db.prepare("UPDATE reviews SET status = 'completed', finished_at = ? WHERE id = ?").run(OCT_15 + 1000, reviewId);

      const view = service.getDocument('v1');

      expect(view?.latestCompleted).toMatchObject({
        reviewId,
        requestedAt: OCT_15,
        counts: { high: 1, medium: 0, low: 0 },
      });
      expect(view?.latestCompleted?.findings.map((item) => item.title)).toEqual(['Old version finding']);
      expect(view?.supersededBy).toEqual({ documentId: 'v3', uploadedAt: 3000 });
    });

    it('read-result AC-7: v1 and v2 both point to v3', () => {
      expect(service.getDocument('v1')?.supersededBy).toEqual({ documentId: 'v3', uploadedAt: 3000 });
      expect(service.getDocument('v2')?.supersededBy).toEqual({ documentId: 'v3', uploadedAt: 3000 });
    });

    it('read-result AC-7: the current version has supersededBy null', () => {
      expect(service.getDocument('v3')?.supersededBy).toBeNull();
      expect(service.getDocument('doc-1')?.supersededBy).toBeNull();
    });
  });

  it('read-result AC-8: returns all 18 findings of the franchise agreement, 5 high, 8 medium, 5 low, in order', () => {
    const documents = JSON.parse(readFileSync(`${SAMPLES_DIR}documents.json`, 'utf8')) as {
      title: string;
      findings: Incoming[];
    }[];
    const franchise = documents.find((doc) => doc.title.startsWith('Franchise agreement'));
    if (!franchise) throw new Error('The franchise agreement is missing from the samples');
    addDocument('franchise');

    completeReview('franchise', franchise.findings);

    const completed = service.getDocument('franchise')?.latestCompleted;
    expect(completed?.findings).toHaveLength(18);
    expect(completed?.counts).toEqual({ high: 5, medium: 8, low: 5 });
    expect(completed?.findings.map((item) => `${item.severity} ${item.clause}`)).toEqual([
      'high 3.1', 'high 4.2', 'high 13.2', 'high 15.3', 'high 16.1',
      'medium 5.2', 'medium 6.3', 'medium 7.1', 'medium 9.1', 'medium 10.2', 'medium 16.4', 'medium 17.3', 'medium 18.2',
      'low 8.4', 'low 11.4', 'low 14.1', 'low 19.1', 'low 20',
    ]);
  });
});
