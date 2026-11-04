import type { IncomingFinding } from '../domain/review.ts';

/**
 * The AI, with the shape of a streaming model client: findings arrive one at a time,
 * the stream ending means the review is done, and a thrown error means it failed.
 */
export interface ReviewEngine {
  run(documentId: string): AsyncIterable<IncomingFinding>;
}
