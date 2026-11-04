import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingFinding } from '../domain/review.ts';

type SampleDocument = { id: string; findings: IncomingFinding[] };

/** The fake engine's script: the findings of each document in `samples/documents.json`. */
export function loadSampleFindings(samplesDir: string): Map<string, IncomingFinding[]> {
  const documents = JSON.parse(
    readFileSync(join(samplesDir, 'documents.json'), 'utf8'),
  ) as SampleDocument[];

  return new Map(documents.map((doc) => [doc.id, doc.findings]));
}
