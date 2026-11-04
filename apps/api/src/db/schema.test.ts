import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from './connection.ts';

const REQUESTED_AT = 1_000_000;
const DEADLINE_AT = REQUESTED_AT + 60_000;
const BEFORE_DEADLINE = DEADLINE_AT - 1;
const AFTER_DEADLINE = DEADLINE_AT + 1;

const FINISH_IF_NOT_OVERDUE = `
  UPDATE reviews SET status = 'completed', finished_at = :now
  WHERE id = :id AND status = 'running' AND deadline_at > :now`;

let db: Db;

function insertReview(id: string, documentId = 'doc-1'): void {
  db.prepare(
    `INSERT INTO reviews (id, document_id, requested_by, requested_at, deadline_at, status)
     VALUES (?, ?, 'lawyer-1', ?, ?, 'running')`,
  ).run(id, documentId, REQUESTED_AT, DEADLINE_AT);
}

function insertFinding(id: string, reviewId: string): void {
  db.prepare(
    `INSERT INTO findings (id, review_id, seq, title, severity, explanation, received_at)
     VALUES (?, ?, 1, 'Title', 'high', 'Explanation', ?)`,
  ).run(id, reviewId, REQUESTED_AT);
}

function complete(id: string): void {
  db.prepare(`UPDATE reviews SET status = 'completed', finished_at = ? WHERE id = ?`).run(
    BEFORE_DEADLINE,
    id,
  );
}

function fail(id: string): void {
  db.prepare(
    `UPDATE reviews SET status = 'failed', failure_reason = 'ai_error', finished_at = ? WHERE id = ?`,
  ).run(BEFORE_DEADLINE, id);
}

beforeEach(() => {
  db = openDatabase();
  db.exec(`
    INSERT INTO lawyers (id, name, title) VALUES ('lawyer-1', 'Name', 'Partner');
    INSERT INTO documents (id, title, type, pages, uploaded_at, uploaded_by)
    VALUES ('doc-1', 'One', 'nda', 1, 1, 'lawyer-1'), ('doc-2', 'Two', 'nda', 1, 1, 'lawyer-1');
  `);
});

describe('one running review per document', () => {
  it('rejects a second running review for the same document on the index', () => {
    insertReview('r1');

    expect(() => insertReview('r2')).toThrow(/UNIQUE constraint failed: reviews\.document_id/);
  });

  it('allows running reviews for different documents', () => {
    insertReview('r1', 'doc-1');

    expect(() => insertReview('r2', 'doc-2')).not.toThrow();
  });

  it('allows a new running review once the previous one has finished', () => {
    insertReview('r1');
    fail('r1');

    expect(() => insertReview('r2')).not.toThrow();
  });
});

describe('finished reviews are frozen', () => {
  it.each([
    ['completed', complete],
    ['failed', fail],
  ])('rejects any update of a %s review', (_status, finish) => {
    insertReview('r1');
    finish('r1');

    expect(() =>
      db.prepare(`UPDATE reviews SET finished_at = 42 WHERE id = 'r1'`).run(),
    ).toThrow(/review is finished/);
    expect(() =>
      db.prepare(`UPDATE reviews SET status = 'running' WHERE id = 'r1'`).run(),
    ).toThrow(/review is finished/);
  });

  it.each([
    ['completed', complete],
    ['failed', fail],
  ])('rejects a finding for a %s review', (_status, finish) => {
    insertReview('r1');
    finish('r1');

    expect(() => insertFinding('f1', 'r1')).toThrow(/review is finished/);
  });

  it('accepts a finding for a running review', () => {
    insertReview('r1');

    expect(() => insertFinding('f1', 'r1')).not.toThrow();
  });
});

describe('reviews are never deleted', () => {
  it.each([
    ['running', () => {}],
    ['completed', complete],
    ['failed', fail],
  ])('rejects a delete of a %s review', (_status, finish) => {
    insertReview('r1');
    finish('r1');

    expect(() => db.prepare(`DELETE FROM reviews WHERE id = 'r1'`).run()).toThrow(
      /reviews cannot be deleted/,
    );
  });
});

describe('facts of a review never change', () => {
  it.each([
    ['document_id', `'doc-2'`],
    ['requested_by', `'lawyer-1'`],
    ['requested_at', '5'],
    ['deadline_at', '5'],
  ])('rejects an update of %s while the review is running', (column, value) => {
    insertReview('r1');

    expect(() =>
      db.prepare(`UPDATE reviews SET ${column} = ${value} WHERE id = 'r1'`).run(),
    ).toThrow(/review facts cannot change/);
  });
});

describe('findings are insert-only', () => {
  beforeEach(() => {
    insertReview('r1');
    insertFinding('f1', 'r1');
  });

  it('rejects an update of a finding', () => {
    expect(() => db.prepare(`UPDATE findings SET title = 'New' WHERE id = 'f1'`).run()).toThrow(
      /findings are insert-only/,
    );
  });

  it('rejects a delete of a finding', () => {
    expect(() => db.prepare(`DELETE FROM findings WHERE id = 'f1'`).run()).toThrow(
      /findings are insert-only/,
    );
  });
});

describe('conditional update', () => {
  it.each([
    ['completed', complete],
    ['failed', fail],
  ])('changes 0 rows on a %s review and leaves it as it was', (status, finish) => {
    insertReview('r1');
    finish('r1');

    const result = db.prepare(FINISH_IF_NOT_OVERDUE).run({ id: 'r1', now: BEFORE_DEADLINE });

    expect(result.changes).toBe(0);
    expect(db.prepare(`SELECT status FROM reviews WHERE id = 'r1'`).get()).toEqual({ status });
  });

  it('changes 0 rows on a running review past its deadline', () => {
    insertReview('r1');

    const result = db.prepare(FINISH_IF_NOT_OVERDUE).run({ id: 'r1', now: AFTER_DEADLINE });

    expect(result.changes).toBe(0);
  });

  it('changes 0 rows exactly at the deadline', () => {
    insertReview('r1');

    const result = db.prepare(FINISH_IF_NOT_OVERDUE).run({ id: 'r1', now: DEADLINE_AT });

    expect(result.changes).toBe(0);
  });

  it('changes 1 row on a running review before its deadline', () => {
    insertReview('r1');

    const result = db.prepare(FINISH_IF_NOT_OVERDUE).run({ id: 'r1', now: BEFORE_DEADLINE });

    expect(result.changes).toBe(1);
  });
});

describe('invalid values', () => {
  it('rejects an unknown severity', () => {
    insertReview('r1');

    expect(() =>
      db
        .prepare(
          `INSERT INTO findings (id, review_id, seq, title, severity, explanation, received_at)
           VALUES ('f1', 'r1', 1, 'Title', 'critical', 'Explanation', 1)`,
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it('rejects a failed review without a reason', () => {
    insertReview('r1');

    expect(() =>
      db.prepare(`UPDATE reviews SET status = 'failed', finished_at = 1 WHERE id = 'r1'`).run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it('rejects a review for a document that does not exist', () => {
    expect(() => insertReview('r1', 'missing')).toThrow(/FOREIGN KEY constraint failed/);
  });
});
