import { RequestReviewResponse, ReviewResponse } from '@lex-poc/contract/reviews';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import { FixedRandom } from '../adapters/fixedRandom.ts';
import { ManualClock } from '../adapters/manualClock.ts';
import { openDatabase, type Db } from '../db/connection.ts';
import { DEFAULT_CONFIG } from '../domain/config.ts';
import { createReviewService, type ReviewService } from '../services/reviewService.ts';
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
  app = buildApp();
  registerReviewRoutes(app, service);
});

describe('POST /documents/:id/reviews', () => {
  it('responds 201 at once, with the contract shape', async () => {
    const response = await post('doc-1');

    expect(response.statusCode).toBe(201);
    expect(RequestReviewResponse.parse(response.json()).reviewId).toEqual(expect.any(String));
  });

  it('of two concurrent requests for one document, one gets 201 and one gets 409', async () => {
    const responses = await Promise.all([post('doc-1'), post('doc-1')]);

    expect(responses.map((response) => response.statusCode).sort()).toEqual([201, 409]);
    const rejected = responses.find((response) => response.statusCode === 409);
    expect(rejected?.json()).toEqual({
      code: 'review_in_progress',
      startedBy: 'Riccardo Fanti',
      startedAt: NOW,
    });
  });

  it('responds 409 with the current version for a superseded document', async () => {
    const response = await post('old');

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      code: 'document_superseded',
      currentVersionId: 'new',
    });
  });

  it('responds 409 with the reset date when the plan is used up', async () => {
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

  it('responds 404 for a document that does not exist', async () => {
    const response = await post('missing');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'document_not_found' });
  });

  it('responds 400 without the lawyer header, and creates nothing', async () => {
    const response = await post('doc-1', {});

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'lawyer_required' });
    expect(db.prepare('SELECT count(*) AS n FROM reviews').get()).toEqual({ n: 0 });
  });

  it('responds 400 for a lawyer that does not exist', async () => {
    const response = await post('doc-1', { 'x-lawyer-id': 'missing' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ code: 'lawyer_not_found' });
  });
});

describe('GET /reviews/:id', () => {
  async function requestedId(): Promise<string> {
    return RequestReviewResponse.parse((await post('doc-1')).json()).reviewId;
  }

  it('responds with status, count, times and server time', async () => {
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

  it('shows an overdue review as failed / timeout right away', async () => {
    const id = await requestedId();
    await clock.advance(60_000);

    const response = await app.inject({ method: 'GET', url: `/reviews/${id}` });

    expect(ReviewResponse.parse(response.json())).toMatchObject({
      status: 'failed',
      failureReason: 'timeout',
    });
  });

  it('does not expose finding content', async () => {
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

  it('responds 404 for a review that does not exist', async () => {
    const response = await app.inject({ method: 'GET', url: '/reviews/missing' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ code: 'review_not_found' });
  });
});
