import { DocumentsResponse } from '@lex-poc/contract/documents';
import { LawyersResponse } from '@lex-poc/contract/lawyers';
import { QuotaResponse } from '@lex-poc/contract/quota';
import { RequestReviewResponse } from '@lex-poc/contract/reviews';
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

let db: Db;
let clock: ManualClock;
let app: FastifyInstance;
let service: ReviewService;

function get(url: string, headers: Record<string, string> = {}) {
  return app.inject({ method: 'GET', url, headers });
}

async function request(documentId: string, lawyerId = 'lawyer-1'): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: `/documents/${documentId}/reviews`,
    headers: { 'x-lawyer-id': lawyerId },
  });
  return RequestReviewResponse.parse(response.json()).reviewId;
}

beforeEach(() => {
  db = openDatabase();
  db.exec(`
    INSERT INTO lawyers (id, name, title) VALUES ('lawyer-1', 'Riccardo Fanti', 'Partner'),
                                                 ('lawyer-2', 'Sofia Greco', 'Trainee');
    INSERT INTO documents (id, title, type, pages, uploaded_at, uploaded_by, supersedes_id)
    VALUES ('doc-1', 'One', 'nda', 4, 500, 'lawyer-1', NULL),
           ('doc-2', 'Two', 'lease', 7, 400, 'lawyer-1', NULL),
           ('old', 'Old', 'nda', 1, 100, 'lawyer-1', NULL),
           ('new', 'New', 'nda', 2, 300, 'lawyer-1', 'old');
  `);
  clock = new ManualClock(NOW);
  service = createReviewService(
    { db, clock, random: new FixedRandom(), config: DEFAULT_CONFIG, logger: { warn: () => {} } },
    { onStarted: () => {} },
  );
  app = buildApp();
  registerReviewRoutes(app, service);
});

describe('GET /lawyers', () => {
  it('documents-list AC-1: returns the lawyers with exactly the contract keys, without a lawyer header', async () => {
    const response = await get('/lawyers');
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(LawyersResponse.parse(body).lawyers).toHaveLength(2);
    expect(Object.keys(body)).toEqual(['lawyers']);
    for (const lawyer of body.lawyers) {
      expect(Object.keys(lawyer).sort()).toEqual(['id', 'name', 'title']);
    }
    expect(body.lawyers).toEqual(
      expect.arrayContaining([{ id: 'lawyer-1', name: 'Riccardo Fanti', title: 'Partner' }]),
    );
  });
});

describe('GET /documents', () => {
  it('documents-list AC-2: returns every document with the contract keys, the same for every lawyer', async () => {
    await request('doc-1', 'lawyer-2');

    const asPartner = await get('/documents', { 'x-lawyer-id': 'lawyer-1' });
    const asTrainee = await get('/documents', { 'x-lawyer-id': 'lawyer-2' });
    const body = asPartner.json();

    expect(asPartner.statusCode).toBe(200);
    expect(asPartner.body).toBe(asTrainee.body);
    expect(Object.keys(body).sort()).toEqual(['documents', 'serverTime']);
    expect(DocumentsResponse.parse(body).documents).toHaveLength(4);
    for (const item of body.documents) {
      expect(Object.keys(item).sort()).toEqual(['documentId', 'pages', 'state', 'supersededBy', 'title', 'type']);
    }
    const one = body.documents.find((item: { documentId: string }) => item.documentId === 'doc-1');
    expect(one.state).toMatchObject({ kind: 'in_progress', requestedBy: 'Sofia Greco', requestedAt: NOW });
  });

  it('documents-list AC-3: a document with no reviews is exactly { kind: not_reviewed }', async () => {
    const body = (await get('/documents')).json();

    const two = body.documents.find((item: { documentId: string }) => item.documentId === 'doc-2');
    expect(two.state).toEqual({ kind: 'not_reviewed' });
  });

  it('documents-list AC-4: a running review gives in_progress and serverTime, and no finding content in the raw body', async () => {
    const id = await request('doc-1');
    service.recordFinding(id, {
      clause: 'Distinctive-Clause-7741',
      title: 'Distinctive-Title-7741',
      severity: 'high',
      excerpt: 'Distinctive-Excerpt-7741',
      explanation: 'Distinctive-Explanation-7741',
    });
    await clock.advance(2000);

    const response = await get('/documents');
    const body = response.json();
    const one = body.documents.find((item: { documentId: string }) => item.documentId === 'doc-1');

    expect(body.serverTime).toBe(NOW + 2000);
    expect(one.state).toEqual({
      kind: 'in_progress',
      reviewId: id,
      requestedBy: 'Riccardo Fanti',
      requestedAt: NOW,
      deadlineAt: NOW + 60_000,
      findingsCount: 1,
    });
    expect(response.body).not.toContain('7741');
    expect(DocumentsResponse.parse(body)).toBeTruthy();
  });

  it('documents-list AC-5: a completed review gives exactly the summary keys and counts', async () => {
    const id = await request('doc-1');
    service.recordFinding(id, { clause: '1', title: 'A', severity: 'high', excerpt: 'E', explanation: 'X' });
    service.recordFinding(id, { clause: '2', title: 'B', severity: 'low', excerpt: 'E', explanation: 'X' });
    service.complete(id);

    const body = (await get('/documents')).json();
    const one = body.documents.find((item: { documentId: string }) => item.documentId === 'doc-1');

    expect(Object.keys(one.state).sort()).toEqual(
      ['findingsCount', 'highCount', 'kind', 'requestedAt', 'requestedBy', 'reviewId'],
    );
    expect(one.state).toEqual({
      kind: 'completed',
      reviewId: id,
      requestedBy: 'Riccardo Fanti',
      requestedAt: NOW,
      findingsCount: 2,
      highCount: 1,
    });
  });

  it('documents-list AC-7: the list is ordered with a replaced version right after its replacement, and marks it', async () => {
    const body = (await get('/documents')).json();

    expect(body.documents.map((item: { documentId: string }) => item.documentId)).toEqual([
      'doc-1',
      'doc-2',
      'new',
      'old',
    ]);
    expect(body.documents[3].supersededBy).toEqual({ documentId: 'new', uploadedAt: 300 });
    expect(body.documents[2].supersededBy).toBeNull();
  });

  it('documents-list AC-9: a failed review gives the exact failed keys, with latestCompleted null when none', async () => {
    const id = await request('doc-1');
    service.fail(id, 'ai_error');

    const body = (await get('/documents')).json();
    const one = body.documents.find((item: { documentId: string }) => item.documentId === 'doc-1');

    expect(Object.keys(one.state).sort()).toEqual(
      ['failureReason', 'findingsCount', 'kind', 'latestCompleted', 'requestedAt', 'requestedBy', 'reviewId'],
    );
    expect(one.state).toMatchObject({ kind: 'failed', failureReason: 'ai_error', latestCompleted: null });
  });

  it('documents-list AC-9: a failed review after a completed one carries the completed summary with its keys', async () => {
    const first = await request('doc-1');
    service.recordFinding(first, { clause: '1', title: 'A', severity: 'high', excerpt: 'E', explanation: 'X' });
    service.complete(first);
    await clock.advance(1000);
    const second = await request('doc-1', 'lawyer-2');
    service.fail(second, 'ai_error');

    const body = (await get('/documents')).json();
    const one = body.documents.find((item: { documentId: string }) => item.documentId === 'doc-1');

    expect(one.state.kind).toBe('failed');
    expect(Object.keys(one.state.latestCompleted).sort()).toEqual(
      ['findingsCount', 'highCount', 'requestedAt', 'requestedBy', 'reviewId'],
    );
    expect(one.state.latestCompleted).toEqual({
      reviewId: first,
      requestedBy: 'Riccardo Fanti',
      requestedAt: NOW,
      findingsCount: 1,
      highCount: 1,
    });
  });

  it('documents-list AC-10: an overdue running review reads as failed / timeout, and the row stays running', async () => {
    await request('doc-1');
    await clock.advance(60_000);

    const body = (await get('/documents')).json();
    const one = body.documents.find((item: { documentId: string }) => item.documentId === 'doc-1');

    expect(one.state).toMatchObject({ kind: 'failed', failureReason: 'timeout' });
    expect(db.prepare('SELECT status FROM reviews').get()).toEqual({ status: 'running' });
  });

  it('documents-list AC-11: a completed review with no findings is completed with 0, not not_reviewed', async () => {
    const id = await request('doc-1');
    service.complete(id);

    const body = (await get('/documents')).json();
    const one = body.documents.find((item: { documentId: string }) => item.documentId === 'doc-1');

    expect(one.state).toMatchObject({ kind: 'completed', findingsCount: 0, highCount: 0 });
  });
});

describe('GET /quota', () => {
  it('documents-list AC-6: returns exactly the quota keys, without a lawyer header', async () => {
    const id = await request('doc-1');
    service.complete(id);
    await request('doc-2', 'lawyer-2');

    const response = await get('/quota');
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(Object.keys(body).sort()).toEqual(
      ['limit', 'month', 'remaining', 'resetsAt', 'running', 'timeZone', 'used'],
    );
    expect(QuotaResponse.parse(body)).toEqual({
      limit: 10,
      used: 1,
      running: 1,
      remaining: 8,
      month: '2026-11',
      resetsAt: Date.UTC(2026, 10, 30, 23),
      timeZone: 'Europe/Rome',
    });
  });
});

describe('requests that record who acted', () => {
  it('documents-list AC-8: reads work with no lawyer header', async () => {
    for (const url of ['/documents', '/quota', '/lawyers']) {
      const response = await get(url);

      expect(response.statusCode, url).toBe(200);
    }
  });

  it('documents-list AC-8: reads ignore an unknown lawyer header too', async () => {
    for (const url of ['/documents', '/quota', '/lawyers']) {
      const response = await get(url, { 'x-lawyer-id': 'missing' });

      expect(response.statusCode, url).toBe(200);
    }
  });
});
