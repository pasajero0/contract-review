import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeEngine } from '../adapters/fakeEngine.ts';
import { FixedRandom } from '../adapters/fixedRandom.ts';
import { ManualClock } from '../adapters/manualClock.ts';
import { openDatabase, type Db } from '../db/connection.ts';
import { DEFAULT_CONFIG } from '../domain/config.ts';
import type { IncomingFinding } from '../domain/review.ts';
import { createReviewService, type ReviewService } from './reviewService.ts';
import { startRunner } from './runner.ts';
import { startSweeper } from './sweeper.ts';

const NOW = Date.UTC(2026, 10, 15, 12);

function finding(title: string): IncomingFinding {
  return { clause: null, title, severity: 'low', excerpt: null, explanation: 'Why' };
}

let db: Db;
let clock: ManualClock;
let logs: string[];

function reviewRow(id: string) {
  return db.prepare('SELECT status, failure_reason, finished_at FROM reviews WHERE id = ?').get(id);
}

function storedTitles(id: string): unknown[] {
  return db
    .prepare('SELECT title FROM findings WHERE review_id = ? ORDER BY seq')
    .all(id)
    .map((row) => (row as { title: string }).title);
}

/** Builds the service with a real fake engine and runner; the values choose the scenario. */
function build(scenario: number[], findings: IncomingFinding[]): ReviewService {
  const engine = createFakeEngine({
    clock,
    random: new FixedRandom(scenario),
    findingsByDocument: new Map([['doc-1', findings]]),
  });
  const logger = { warn: (message: string) => logs.push(message) };
  const deps = { db, clock, random: new FixedRandom(), config: DEFAULT_CONFIG, logger };
  const service: ReviewService = createReviewService(deps, {
    onStarted: (review) => startRunner({ engine, logger }, service, review),
  });
  return service;
}

function request(service: ReviewService): string {
  const result = service.requestReview('doc-1', 'lawyer-1');
  if (!result.ok) throw new Error(`Expected a review, got ${result.code}`);
  return result.review.reviewId;
}

beforeEach(() => {
  db = openDatabase();
  db.exec(`
    INSERT INTO lawyers (id, name, title) VALUES ('lawyer-1', 'Name', 'Partner');
    INSERT INTO documents (id, title, type, pages, uploaded_at, uploaded_by)
    VALUES ('doc-1', 'One', 'nda', 1, 1, 'lawyer-1');
  `);
  clock = new ManualClock(NOW);
  logs = [];
});

describe('runner with the fake engine', () => {
  it('request-review AC-3: normal scenario completes with all findings', async () => {
    const service = build([0.5, 0], [finding('a'), finding('b'), finding('c')]);
    const id = request(service);

    await clock.advance(5000);

    expect(reviewRow(id)).toEqual({ status: 'completed', failure_reason: null, finished_at: NOW + 5000 });
    expect(storedTitles(id)).toEqual(['a', 'b', 'c']);
    expect(logs).toEqual([]);
  });

  it('request-review AC-4: shows progress while running', async () => {
    const service = build([0.5, 0], [finding('a'), finding('b'), finding('c')]);
    const id = request(service);

    await clock.advance(2500);

    expect(service.getReview(id)).toMatchObject({ status: 'running', findingsCount: 2 });
  });

  it('request-review AC-11: "fail after 2nd finding" ends as failed / ai_error with 2 findings', async () => {
    const service = build([0.1, 0.5, 0], [finding('a'), finding('b'), finding('c')]);
    const id = request(service);

    await clock.advance(5000);

    expect(reviewRow(id)).toMatchObject({ status: 'failed', failure_reason: 'ai_error' });
    expect(storedTitles(id)).toEqual(['a', 'b']);
  });

  it('request-review AC-6: a document with no findings completes with 0 findings', async () => {
    const service = build([0.5, 0], []);
    const id = request(service);

    await clock.advance(5000);

    expect(reviewRow(id)).toMatchObject({ status: 'completed' });
    expect(storedTitles(id)).toEqual([]);
  });

  it('request-review AC-13: slow scenario with nothing sent: failed / timeout at 60 s, and the completion at 70 s is dropped', async () => {
    // Duration 1/6 of the 60 s range gives 70 s in total.
    const service = build([0.25, 1 / 6], []);
    const id = request(service);
    const stop = startSweeper({ clock, config: DEFAULT_CONFIG, logger: { warn: () => {} } }, service);

    await clock.advance(60_000);
    expect(reviewRow(id)).toEqual({ status: 'failed', failure_reason: 'timeout', finished_at: NOW + 60_000 });

    await clock.advance(10_000);
    stop();

    expect(reviewRow(id)).toEqual({ status: 'failed', failure_reason: 'timeout', finished_at: NOW + 60_000 });
    expect(logs).toEqual([expect.stringContaining('completion arrived 10s after deadline, dropped')]);
  });

  it('request-review AC-14: slow scenario: a finding after the deadline is dropped and logged', async () => {
    // 2 findings over 90 s: they arrive at 30 s and 60 s; 60 s is already too late.
    const service = build([0.25, 0.5], [finding('a'), finding('b')]);
    const id = request(service);

    await clock.advance(90_000);

    expect(storedTitles(id)).toEqual(['a']);
    expect(logs).toEqual([
      expect.stringContaining('finding arrived 0s after deadline, dropped'),
      expect.stringContaining('completion arrived 30s after deadline, dropped'),
    ]);
  });

  it('request-review AC-14: a late completion does not use the plan', async () => {
    const service = build([0.25, 1 / 6], []);
    const id = request(service);

    await clock.advance(70_000);

    expect(service.getReview(id)).toMatchObject({ status: 'failed', failureReason: 'timeout' });
    expect(db.prepare(`SELECT count(*) AS n FROM reviews WHERE status = 'completed'`).get()).toEqual({ n: 0 });
  });

  it('does not start a runner when the request is rejected', async () => {
    const service = build([0.5, 0], [finding('a')]);
    const id = request(service);

    expect(service.requestReview('doc-1', 'lawyer-1')).toMatchObject({ code: 'review_in_progress' });
    await clock.advance(5000);

    expect(storedTitles(id)).toEqual(['a']);
  });

  it('request-review AC-5: a retry after a failure runs again as a new review', async () => {
    const service = build([0.1, 0, 0], [finding('a')]);
    const first = request(service);
    await clock.advance(5000);
    expect(reviewRow(first)).toMatchObject({ status: 'failed' });

    const second = request(service);

    expect(second).not.toBe(first);
    expect(reviewRow(second)).toMatchObject({ status: 'running' });

    await clock.advance(5000);

    expect(reviewRow(second)).toMatchObject({ status: 'failed', failure_reason: 'ai_error' });
  });
});

describe('runner when the engine or the service breaks', () => {
  it('request-review AC-12: an unknown severity fails the whole review as ai_error', async () => {
    const logger = { warn: (message: string) => logs.push(message) };
    const deps = { db, clock, random: new FixedRandom(), config: DEFAULT_CONFIG, logger };
    const engine = {
      async *run(): AsyncGenerator<IncomingFinding> {
        yield finding('valid');
        yield { ...finding('bad'), severity: 'critical' };
      },
    };
    const service: ReviewService = createReviewService(deps, {
      onStarted: (review) => startRunner({ engine, logger }, service, review),
    });

    const id = request(service);
    await clock.advance(1000);

    expect(reviewRow(id)).toMatchObject({ status: 'failed', failure_reason: 'ai_error' });
    expect(db.prepare(`SELECT count(*) AS n FROM reviews WHERE status = 'completed'`).get()).toEqual({ n: 0 });
    expect(storedTitles(id)).toEqual(['valid']);
    expect(logs.join(' ')).toContain('unknown severity');
  });

  it('request-review AC-11: turns any engine error into failed / ai_error', async () => {
    const logger = { warn: (message: string) => logs.push(message) };
    const deps = { db, clock, random: new FixedRandom(), config: DEFAULT_CONFIG, logger };
    const engine = {
      async *run(): AsyncGenerator<IncomingFinding> {
        throw new Error('model unavailable');
      },
    };
    const service: ReviewService = createReviewService(deps, {
      onStarted: (review) => startRunner({ engine, logger }, service, review),
    });

    const id = request(service);
    await clock.advance(1);

    expect(reviewRow(id)).toMatchObject({ status: 'failed', failure_reason: 'ai_error' });
    expect(logs).toEqual([expect.stringContaining('model unavailable')]);
  });

  it('logs instead of crashing when the service itself throws', async () => {
    const logger = { warn: (message: string) => logs.push(message) };
    const engine = createFakeEngine({
      clock,
      random: new FixedRandom([0.5, 0]),
      findingsByDocument: new Map([['doc-1', []]]),
    });
    const broken: ReviewService = {
      requestReview: () => ({ ok: false, code: 'document_not_found' }),
      recordFinding: () => false,
      complete: () => {
        throw new Error('disk full');
      },
      fail: () => {
        throw new Error('disk full');
      },
      expireOverdue: () => 0,
      getReview: () => null,
      getDocument: () => null,
      listLawyers: () => [],
      getQuota: () => ({ limit: 10, used: 0, running: 0, remaining: 10, month: '', resetsAt: 0, timeZone: '' }),
      listDocuments: () => ({ documents: [], serverTime: 0 }),
    };

    startRunner({ engine, logger }, broken, { reviewId: 'r1', documentId: 'doc-1' });
    await clock.advance(5000);

    expect(logs.join(' ')).toContain('disk full');
    expect(logs.join(' ')).toContain('runner stopped');
  });

  it('if complete throws but fail works, it is not reported as an engine failure', async () => {
    const logger = { warn: (message: string) => logs.push(message) };
    const engine = createFakeEngine({
      clock,
      random: new FixedRandom([0.5, 0]),
      findingsByDocument: new Map([['doc-1', []]]),
    });
    const failCalls: string[] = [];
    const partlyBroken: ReviewService = {
      requestReview: () => ({ ok: false, code: 'document_not_found' }),
      recordFinding: () => false,
      complete: () => {
        throw new Error('disk full');
      },
      fail: (_id, reason) => {
        failCalls.push(reason);
        return true;
      },
      expireOverdue: () => 0,
      getReview: () => null,
      getDocument: () => null,
      listLawyers: () => [],
      getQuota: () => ({ limit: 10, used: 0, running: 0, remaining: 10, month: '', resetsAt: 0, timeZone: '' }),
      listDocuments: () => ({ documents: [], serverTime: 0 }),
    };

    startRunner({ engine, logger }, partlyBroken, { reviewId: 'r1', documentId: 'doc-1' });
    await clock.advance(5000);

    expect(logs.join(' ')).not.toContain('engine failed');
    expect(failCalls).not.toContain('ai_error');
  });
});

describe('sweeper', () => {
  it('calls expireOverdue every sweepIntervalMs and stops when told', async () => {
    const service = build([0.5, 0], []);
    let calls = 0;
    const counting: ReviewService = {
      ...service,
      expireOverdue: () => {
        calls += 1;
        return 0;
      },
    };

    const stop = startSweeper({ clock, config: DEFAULT_CONFIG, logger: { warn: () => {} } }, counting);
    expect(calls).toBe(1);

    await clock.advance(10_000);
    expect(calls).toBe(3);

    stop();
    await clock.advance(10_000);
    expect(calls).toBe(3);
  });

  it('request-review AC-36: logs a sweep error, does not throw, and runs the next sweep on schedule', async () => {
    const service = build([0.5, 0], []);
    let calls = 0;
    const flaky: ReviewService = {
      ...service,
      expireOverdue: () => {
        calls += 1;
        // The immediate first tick and the first scheduled tick fail; later ticks work.
        if (calls <= 2) throw new Error(`sweep broke on call ${calls}`);
        return 0;
      },
    };
    const logger = { warn: (message: string) => logs.push(message) };

    let stop: () => void = () => {};
    expect(() => {
      stop = startSweeper({ clock, config: DEFAULT_CONFIG, logger }, flaky);
    }).not.toThrow();
    expect(calls).toBe(1);
    expect(logs).toEqual([expect.stringContaining('sweep broke on call 1')]);

    await expect(clock.advance(DEFAULT_CONFIG.sweepIntervalMs)).resolves.toBeUndefined();
    expect(calls).toBe(2);
    expect(logs).toEqual([
      expect.stringContaining('sweep broke on call 1'),
      expect.stringContaining('sweep broke on call 2'),
    ]);

    await clock.advance(DEFAULT_CONFIG.sweepIntervalMs * 2);
    expect(calls).toBe(4);
    expect(logs).toHaveLength(2);

    stop();
    await clock.advance(DEFAULT_CONFIG.sweepIntervalMs * 2);
    expect(calls).toBe(4);
  });
});

describe('restart', () => {
  it('request-review AC-20: a review running during a restart expires and frees the document', async () => {
    // Before the restart: a review is running; its AI task is lost with the process.
    const random = new FixedRandom();
    const before = createReviewService(
      { db, clock, random, config: DEFAULT_CONFIG, logger: { warn: () => {} } },
      { onStarted: () => {} },
    );
    const id = request(before);
    await clock.advance(20_000);

    // After the restart: a new service and sweeper on the same database.
    const after = createReviewService(
      { db, clock, random, config: DEFAULT_CONFIG, logger: { warn: () => {} } },
      { onStarted: () => {} },
    );
    const stop = startSweeper({ clock, config: DEFAULT_CONFIG, logger: { warn: () => {} } }, after);

    expect(after.getReview(id)).toMatchObject({ status: 'running' });
    await clock.advance(40_000);
    stop();

    expect(reviewRow(id)).toEqual({ status: 'failed', failure_reason: 'timeout', finished_at: NOW + 60_000 });
    expect(after.requestReview('doc-1', 'lawyer-1')).toMatchObject({ ok: true });
  });
});
