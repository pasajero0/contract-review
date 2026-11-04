import type { Logger } from '../ports/logger.ts';
import type { ReviewEngine } from '../ports/reviewEngine.ts';
import type { ReviewService, StartedReview } from './reviewService.ts';

export type RunnerDeps = { engine: ReviewEngine; logger: Logger };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Runs the engine in the background and forwards each event to the service. Decides nothing. */
export function startRunner(
  { engine, logger }: RunnerDeps,
  service: ReviewService,
  { reviewId, documentId }: StartedReview,
): void {
  async function run(): Promise<void> {
    try {
      for await (const finding of engine.run(documentId)) {
        service.recordFinding(reviewId, finding);
      }
    } catch (error) {
      logger.warn(`review ${reviewId}: engine failed: ${messageOf(error)}`);
      service.fail(reviewId, 'ai_error');
      return;
    }
    service.complete(reviewId);
  }

  // The last line of defence: a background task must not crash the process.
  run().catch((error: unknown) => {
    logger.warn(`review ${reviewId}: runner stopped: ${messageOf(error)}`);
  });
}
