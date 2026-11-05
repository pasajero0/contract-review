import type { Config } from '../domain/config.ts';
import type { Clock, TimerHandle } from '../ports/clock.ts';
import type { Logger } from '../ports/logger.ts';
import type { ReviewService } from './reviewService.ts';

export type SweeperDeps = { clock: Clock; config: Pick<Config, 'sweepIntervalMs'>; logger: Logger };

/** Expires overdue reviews at once, then every sweepIntervalMs. Returns a function that stops it. */
export function startSweeper({ clock, config, logger }: SweeperDeps, service: ReviewService): () => void {
  let timer: TimerHandle;

  function tick(): void {
    // An uncaught error in a timer would end the process: log it and keep the timer.
    try {
      service.expireOverdue();
    } catch (error) {
      logger.warn(`sweep failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    timer = clock.setTimeout(tick, config.sweepIntervalMs);
  }
  tick();

  return () => clock.clearTimeout(timer);
}
