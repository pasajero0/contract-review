import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export type Db = DatabaseSync;

const SCHEMA = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

export function openDatabase(path = ':memory:'): Db {
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  db.exec(SCHEMA);
  return db;
}

/**
 * Runs fn in an immediate transaction. fn must be synchronous: the type rejects a function
 * that returns a promise, because an await inside a transaction lets other requests in.
 */
export function inTransaction<T>(
  db: Db,
  fn: () => T extends PromiseLike<unknown> ? never : T,
): T extends PromiseLike<unknown> ? never : T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
