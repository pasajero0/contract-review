import { DocumentResponse } from '@lex-poc/contract/documents';
import { ErrorBody } from '@lex-poc/contract/errors';
import { RequestReviewResponse, ReviewResponse } from '@lex-poc/contract/reviews';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { FixedRandom } from '../adapters/fixedRandom.ts';
import { ManualClock } from '../adapters/manualClock.ts';
import { openDatabase, type Db } from '../db/connection.ts';
import { DEFAULT_CONFIG } from '../domain/config.ts';
import { createReviewService, type ReviewService } from '../services/reviewService.ts';
import { startRunner } from '../services/runner.ts';
import { buildApp } from './app.ts';
import { registerReviewRoutes } from './reviews.ts';

const NOW = Date.UTC(2026, 10, 15, 12);
const HEADERS = { 'x-lawyer-id': 'lawyer-1' };

let db: Db;
let clock: ManualClock;
let app: FastifyInstance;
let service: ReviewService;

function post(documentId: string, headers: Record<string, string> = HEADERS) {
  return app.inject({ method: 'POST', url: `/documents/${documentId}/reviews`, headers });
}

beforeEach(() => {
  db = openDatabase();
  db.exec(`
    INSERT INTO lawyers (id, name, title) VALUES ('lawyer-1', 'Riccardo Fanti', 'Partner');
    INSERT INTO documents (id, title, type, pages, uploaded_at, uploaded_by, supersedes_id)
    VALUES ('doc-1', 'One', 'nda', 1, 1, 'lawyer-1', NULL),
           ('doc-2', 'Two', 'nda', 1, 1, 'lawyer-1', NULL),
           ('old', 'Old', 'nda', 1, 1, 'lawyer-1', NULL),
           ('new', 'New', 'nda', 1, 1, 'lawyer-1', 'old');
  `);
  clock = new ManualClock(NOW);
  service = createReviewService(
    { db, clock, random: new FixedRandom(), config: DEFAULT_CONFIG, logger: { warn: () => {} } },
    { onStarted: () => {} },
  );
  app = buildApp({ warn: () => {} });
  registerReviewRoutes(app, service);
});

describe('POST /documents/:id/reviews', () => {
  it('request-review AC-1: responds 201 with the contract shape', async () => {
    const response = await post('doc-1');

    expect(response.statusCode).toBe(201);
    expect(RequestReviewResponse.parse(response.json()).reviewId).toEqual(expect.any(String));
  });

  it('request-review AC-15: of two requests sent together over HTTP (Promise.all), one gets 201 and one gets 409', async () => {
    const responses = await Promise.all([post('doc-1'), post('doc-1')]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    const rejected = responses.find((response) => response.statusCode === 409);
    expect(rejected?.json()).toEqual({
      code: 'review_in_progress',
      startedBy: 'Riccardo Fanti',
      startedAt: NOW,
    });
  });

  it('request-review AC-10: responds 409 with the current version for a superseded document', async () => {
    const response = await post('old');

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: 'document_superseded',
      currentVersionId: 'new',
    });
  });

  it('request-review AC-9: responds 409 with the reset date when the plan is used up', async () => {
    db.exec(`
      INSERT INTO documents (id, title, type, pages, uploaded_at, uploaded_by)
      SELECT 'past-' || value, 'Past', 'nda', 1, 1, 'lawyer-1' FROM json_each('[1,2,3,4,5,6,7,8,9,10]');
    `);
    db.prepare(
      `INSERT INTO reviews (id, document_id, requested_by, requested_at, deadline_at, status, finished_at)
       SELECT 'r-' || value, 'past-' || value, 'lawyer-1', ?, ?, 'completed', ?
       FROM json_each('[1,2,3,4,5,6,7,8,9,10]')`,
    ).run(NOW - 1000, NOW + 59_000, NOW - 500);

    const response = await post('doc-1');

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: 'plan_exhausted',
      resetsAt: Date.UTC(2026, 10, 30, 23),
    });
  });

  it('request-review AC-10: responds 404 for a document that does not exist', async () => {
    const response = await post('missing');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'document_not_found' });
  });

  it('documents-list AC-8: responds 400 lawyer_required without the lawyer header, and creates nothing', async () => {
    const response = await post('doc-1', {});

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'lawyer_required' });
    expect(db.prepare('SELECT count(*) AS n FROM reviews').get()).toEqual({ n: 0 });
  });

  it('documents-list AC-8: responds 400 lawyer_not_found for a lawyer that does not exist', async () => {
    const response = await post('doc-1', { 'x-lawyer-id': 'missing' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'lawyer_not_found' });
  });
});

describe('POST /documents/:id/reviews without waiting for the AI', () => {
  it('request-review AC-1: answers 201 although the AI never produces anything', async () => {
    // The runner is real, and its engine never yields, never finishes and never fails.
    const stuckEngine = {
      run: () => ({ [Symbol.asyncIterator]: () => ({ next: () => new Promise<never>(() => {}) }) }),
    };
    const logger = { warn: () => {} };
    const stuckApp = buildApp({ warn: () => {} });
    const stuckService: ReviewService = createReviewService(
      { db, clock, random: new FixedRandom(), config: DEFAULT_CONFIG, logger },
      { onStarted: (review) => startRunner({ engine: stuckEngine, logger }, stuckService, review) },
    );
    registerReviewRoutes(stuckApp, stuckService);

    const response = await stuckApp.inject({
      method: 'POST',
      url: '/documents/doc-1/reviews',
      headers: HEADERS,
    });

    expect(response.statusCode).toBe(201);
    const { reviewId } = RequestReviewResponse.parse(response.json());
    expect(stuckService.getReview(reviewId)).toMatchObject({ status: 'running', findingsCount: 0 });
  });
});

describe('server errors and rejected requests', () => {
  const loggedMessages: string[] = [];
  let failingApp: FastifyInstance;

  function appWith(override: Partial<ReviewService>): FastifyInstance {
    const built = buildApp({ warn: (message: string) => loggedMessages.push(message) });
    registerReviewRoutes(built, { ...service, ...override });
    return built;
  }

  beforeEach(() => {
    loggedMessages.length = 0;
  });

  it('request-review AC-37: an unexpected error is logged and answers 500 with internal_error and no internal details', async () => {
    failingApp = appWith({
      getQuota: () => {
        throw new Error('secret sqlite detail');
      },
    });

    const response = await failingApp.inject({ method: 'GET', url: '/quota' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ code: 'internal_error' });
    expect(ErrorBody.parse(response.json())).toEqual({ code: 'internal_error' });
    expect(response.body).not.toContain('secret sqlite detail');
    expect(loggedMessages.join(' ')).toContain('secret sqlite detail');
  });

  it("request-review AC-37: a response that fails the contract's schema is logged and answers 500 with internal_error", async () => {
    failingApp = appWith({
      // Not a quota shape: the contract's schema rejects it before it is sent.
      getQuota: () => ({ limit: 'many' }) as unknown as ReturnType<ReviewService['getQuota']>,
    });

    const response = await failingApp.inject({ method: 'GET', url: '/quota' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ code: 'internal_error' });
    expect(loggedMessages).toHaveLength(1);
  });

  it('request-review AC-38: malformed JSON answers 400 with bad_request and is not logged as a server error', async () => {
    const quietApp = appWith({});

    const response = await quietApp.inject({
      method: 'POST',
      url: '/documents/doc-1/reviews',
      headers: { ...HEADERS, 'content-type': 'application/json' },
      payload: '{',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'bad_request' });
    expect(ErrorBody.parse(response.json())).toEqual({ code: 'bad_request' });
    expect(loggedMessages).toEqual([]);
  });
});

describe('GET /documents/:id', () => {
  function get(documentId: string, headers: Record<string, string> = {}) {
    return app.inject({ method: 'GET', url: `/documents/${documentId}`, headers });
  }

  it('request-review AC-7: responds with the document, no review and a free plan, without a lawyer header', async () => {
    const response = await get('doc-1');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      documentId: 'doc-1',
      title: 'One',
      type: 'nda',
      pages: 1,
      current: null,
      lastFailed: null,
      canRequest: { allowed: true, remaining: 10 },
      latestCompleted: null,
      supersededBy: null,
      serverTime: NOW,
    });
    expect(DocumentResponse.parse(response.json()).canRequest).toEqual({ allowed: true, remaining: 10 });
  });

  it('request-review AC-7: responds 404 for a document that does not exist', async () => {
    const response = await get('missing');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'document_not_found' });
  });

  it('request-review AC-7: a running review shows who and when, and no finding content anywhere in the body', async () => {
    const id = RequestReviewResponse.parse((await post('doc-1')).json()).reviewId;
    service.recordFinding(id, {
      clause: 'Distinctive-Clause-1180',
      title: 'Distinctive-Title-6604',
      severity: 'high',
      excerpt: 'Distinctive-Excerpt-3917',
      explanation: 'Distinctive-Explanation-2275',
    });
    await clock.advance(1000);

    const response = await get('doc-1');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      current: {
        reviewId: id,
        requestedBy: 'Riccardo Fanti',
        requestedAt: NOW,
        deadlineAt: NOW + 60_000,
        findingsCount: 1,
      },
      lastFailed: null,
      canRequest: { allowed: false, reason: 'review_in_progress', startedBy: 'Riccardo Fanti', startedAt: NOW },
      serverTime: NOW + 1000,
    });
    expect(Object.keys(response.json().current).sort()).toEqual(
      ['deadlineAt', 'findingsCount', 'requestedAt', 'requestedBy', 'reviewId'],
    );
    for (const secret of ['Clause-1180', 'Title-6604', 'Excerpt-3917', 'Explanation-2275']) {
      expect(response.body).not.toContain(secret);
    }
  });

  it('request-review AC-7: a failed review shows reason and count, and the plan stays free', async () => {
    const id = RequestReviewResponse.parse((await post('doc-1')).json()).reviewId;
    service.fail(id, 'ai_error');

    const response = await get('doc-1');

    expect(response.json()).toMatchObject({
      current: null,
      lastFailed: { reviewId: id, failureReason: 'ai_error', findingsCount: 0 },
      canRequest: { allowed: true, remaining: 10 },
    });
    expect(Object.keys(response.json().lastFailed).sort()).toEqual(
      ['failureReason', 'findingsCount', 'requestedAt', 'requestedBy', 'reviewId'],
    );
  });

  it('request-review AC-13: an overdue running review reads as failed / timeout, and the row stays running', async () => {
    await post('doc-1');
    await clock.advance(60_000);

    const response = await get('doc-1');

    expect(response.json()).toMatchObject({
      current: null,
      lastFailed: { failureReason: 'timeout' },
      canRequest: { allowed: true },
    });
    expect(db.prepare('SELECT status FROM reviews').get()).toEqual({ status: 'running' });
  });

  it('request-review AC-7: a used-up plan gives the limit and the reset date', async () => {
    db.exec(`
      INSERT INTO documents (id, title, type, pages, uploaded_at, uploaded_by)
      SELECT 'past-' || value, 'Past', 'nda', 1, 1, 'lawyer-1' FROM json_each('[1,2,3,4,5,6,7,8,9,10]');
    `);
    db.prepare(
      `INSERT INTO reviews (id, document_id, requested_by, requested_at, deadline_at, status, finished_at)
       SELECT 'r-' || value, 'past-' || value, 'lawyer-1', ?, ?, 'completed', ?
       FROM json_each('[1,2,3,4,5,6,7,8,9,10]')`,
    ).run(NOW - 1000, NOW + 59_000, NOW - 500);

    const response = await get('doc-1');

    expect(response.json().canRequest).toEqual({
      allowed: false,
      reason: 'plan_exhausted',
      limit: 10,
      resetsAt: Date.UTC(2026, 10, 30, 23),
    });
  });

  it('request-review AC-10: a request and canRequest name the end of a chain v1, v2, v3', async () => {
    db.exec(`
      INSERT INTO documents (id, title, type, pages, uploaded_at, uploaded_by, supersedes_id)
      VALUES ('v1', 'V1', 'nda', 1, 1, 'lawyer-1', NULL),
             ('v2', 'V2', 'nda', 1, 1, 'lawyer-1', 'v1'),
             ('v3', 'V3', 'nda', 1, 1, 'lawyer-1', 'v2');
    `);

    const request = await post('v1');
    expect(request.statusCode).toBe(409);
    expect(request.json()).toEqual({ code: 'document_superseded', currentVersionId: 'v3' });

    for (const id of ['v1', 'v2']) {
      expect((await get(id)).json().canRequest).toEqual({
        allowed: false,
        reason: 'document_superseded',
        currentVersionId: 'v3',
      });
    }
  });
});

describe('GET /reviews/:id', () => {
  async function requestedId(): Promise<string> {
    return RequestReviewResponse.parse((await post('doc-1')).json()).reviewId;
  }

  it('request-review AC-4: responds with status, count, times and server time', async () => {
    const id = await requestedId();
    await clock.advance(1000);

    const response = await app.inject({ method: 'GET', url: `/reviews/${id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      reviewId: id,
      status: 'running',
      findingsCount: 0,
      requestedAt: NOW,
      deadlineAt: NOW + 60_000,
      failureReason: null,
      serverTime: NOW + 1000,
    });
  });

  it('request-review AC-13: shows an overdue review as failed / timeout right away', async () => {
    const id = await requestedId();
    await clock.advance(60_000);

    const response = await app.inject({ method: 'GET', url: `/reviews/${id}` });

    expect(ReviewResponse.parse(response.json())).toMatchObject({
      status: 'failed',
      failureReason: 'timeout',
    });
  });

  it('request-review AC-4: does not expose finding content', async () => {
    const id = await requestedId();
    service.recordFinding(id, {
      clause: null,
      title: 'Distinctive-Title-7731',
      severity: 'high',
      excerpt: null,
      explanation: 'Distinctive-Explanation-4482',
    });

    const response = await app.inject({ method: 'GET', url: `/reviews/${id}` });

    expect(response.json()).toMatchObject({ findingsCount: 1 });
    expect(Object.keys(response.json())).not.toContain('findings');
    expect(response.body).not.toContain('Distinctive-Title-7731');
    expect(response.body).not.toContain('Distinctive-Explanation-4482');
  });

  it('read-result AC-4: responds 404 review_not_found for an unknown review id', async () => {
    const response = await app.inject({ method: 'GET', url: '/reviews/missing' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'review_not_found' });
  });
});

describe('GET /documents/:id: the result of a review', () => {
  function get(documentId: string) {
    return app.inject({ method: 'GET', url: `/documents/${documentId}` });
  }

  it('read-result AC-1: the raw body carries latestCompleted with the contract keys and nothing else', async () => {
    const id = RequestReviewResponse.parse((await post('doc-1')).json()).reviewId;
    service.recordFinding(id, { clause: '2.1', title: 'T', severity: 'high', excerpt: 'E', explanation: 'X' });
    service.complete(id);

    const response = await get('doc-1');
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(Object.keys(body.latestCompleted).sort()).toEqual(
      ['counts', 'findings', 'finishedAt', 'requestedAt', 'requestedBy', 'reviewId'],
    );
    expect(Object.keys(body.latestCompleted.counts).sort()).toEqual(['high', 'low', 'medium']);
    expect(Object.keys(body.latestCompleted.findings[0]).sort()).toEqual(
      ['clause', 'explanation', 'excerpt', 'severity', 'title'].sort(),
    );
    expect(body.latestCompleted).toMatchObject({ reviewId: id, requestedBy: 'Riccardo Fanti', counts: { high: 1 } });
    expect(DocumentResponse.parse(body).latestCompleted?.findings).toHaveLength(1);
  });

  it('read-result AC-3: a running review with findings leaves its strings out of the raw body', async () => {
    const id = RequestReviewResponse.parse((await post('doc-1')).json()).reviewId;
    service.recordFinding(id, {
      clause: 'Distinctive-Clause-5521',
      title: 'Distinctive-Title-5521',
      severity: 'high',
      excerpt: 'Distinctive-Excerpt-5521',
      explanation: 'Distinctive-Explanation-5521',
    });

    const response = await get('doc-1');

    expect(response.statusCode).toBe(200);
    expect(response.json().latestCompleted).toBeNull();
    expect(response.body).not.toContain('5521');
  });
});

