import type { Config } from '../domain/config.ts';
import type { Clock, TimerHandle } from '../ports/clock.ts';
import type { ReviewService } from './reviewService.ts';

export type SweeperDeps = { clock: Clock; config: Pick<Config, 'sweepIntervalMs'> };

/** Expires overdue reviews at once, then every sweepIntervalMs. Returns a function that stops it. */
export function startSweeper({ clock, config }: SweeperDeps, service: ReviewService): () => void {
  let timer: TimerHandle;

  function tick(): void {
    service.expireOverdue();
    timer = clock.setTimeout(tick, config.sweepIntervalMs);
  }
  tick();

  return () => clock.clearTimeout(timer);
}
