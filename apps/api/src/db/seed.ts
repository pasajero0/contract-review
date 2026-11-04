import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './connection.ts';

type SampleLawyer = { id: string; name: string; title: string };

type SampleDocument = {
  id: string;
  title: string;
  type: string;
  pages: number;
  uploadedAt: string;
  uploadedBy: string;
  supersedes: string | null;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

// Safe to run on every start: rows that already exist are left alone.
// Findings in the samples are the fake engine's script, so they are not stored here.
export function seed(db: Db, samplesDir: string): void {
  const lawyers = readJson<SampleLawyer[]>(join(samplesDir, 'lawyers.json'));
  const documents = readJson<SampleDocument[]>(join(samplesDir, 'documents.json'));

  const insertLawyer = db.prepare(
    'INSERT OR IGNORE INTO lawyers (id, name, title) VALUES (?, ?, ?)',
  );
  const insertDocument = db.prepare(
    `INSERT OR IGNORE INTO documents (id, title, type, pages, uploaded_at, uploaded_by, supersedes_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const lawyer of lawyers) {
      insertLawyer.run(lawyer.id, lawyer.name, lawyer.title);
    }
    for (const doc of documents) {
      insertDocument.run(
        doc.id,
        doc.title,
        doc.type,
        doc.pages,
        Date.parse(doc.uploadedAt),
        doc.uploadedBy,
        doc.supersedes,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
