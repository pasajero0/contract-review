import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from './connection.ts';
import { seed } from './seed.ts';

const SAMPLES_DIR = fileURLToPath(new URL('../../../../samples/', import.meta.url));
const LEASE_V1 = '125c8706-e702-4d6f-b2c5-80aeb110cd5c';
const LEASE_V2 = 'a8d4c1e0-5f3b-4b7a-9e2d-6c1f0b3a7d58';

function count(db: Db, table: string): number {
  const row = db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

describe('seed from samples', () => {
  let db: Db;

  beforeEach(() => {
    db = openDatabase();
    seed(db, SAMPLES_DIR);
  });

  it('documents-list AC-12: loads 3 lawyers and 13 documents', () => {
    expect(count(db, 'lawyers')).toBe(3);
    expect(count(db, 'documents')).toBe(13);
  });

  it('keeps the link from the new lease version to the old one', () => {
    const row = db.prepare('SELECT supersedes_id FROM documents WHERE id = ?').get(LEASE_V2);

    expect(row).toEqual({ supersedes_id: LEASE_V1 });
  });

  it('stores uploaded_at as epoch milliseconds', () => {
    const row = db.prepare('SELECT uploaded_at FROM documents WHERE id = ?').get(LEASE_V2);

    expect(row).toEqual({ uploaded_at: Date.UTC(2026, 8, 24, 10, 15) });
  });

  it('creates no reviews and no findings', () => {
    expect(count(db, 'reviews')).toBe(0);
    expect(count(db, 'findings')).toBe(0);
  });

  it('can run twice without duplicates', () => {
    seed(db, SAMPLES_DIR);

    expect(count(db, 'lawyers')).toBe(3);
    expect(count(db, 'documents')).toBe(13);
  });
});
