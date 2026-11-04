import type { Clock, TimerHandle } from '../ports/clock.ts';

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle: TimerHandle) => clearTimeout(handle as NodeJS.Timeout),
};
