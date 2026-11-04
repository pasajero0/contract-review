import { setImmediate as flushAsyncWork } from 'node:timers/promises';
import type { Clock, TimerHandle } from '../ports/clock.ts';

type Timer = { id: number; dueAt: number; callback: () => void };

/**
 * Clock for tests: time moves only through advance().
 * advance() is async on purpose: after each timer it lets awaiting code continue,
 * so a timer set by that code still fires at its own time within the same advance.
 */
export class ManualClock implements Clock {
  private current: number;
  private nextId = 1;
  private timers: Timer[] = [];

  constructor(startMs = 0) {
    this.current = startMs;
  }

  now(): number {
    return this.current;
  }

  setTimeout(callback: () => void, ms: number): TimerHandle {
    const timer = { id: this.nextId++, dueAt: this.current + ms, callback };
    this.timers.push(timer);
    return timer.id;
  }

  clearTimeout(handle: TimerHandle): void {
    this.timers = this.timers.filter((timer) => timer.id !== handle);
  }

  async advance(ms: number): Promise<void> {
    const target = this.current + ms;
    await flushAsyncWork();

    for (let timer = this.nextDue(target); timer; timer = this.nextDue(target)) {
      this.timers = this.timers.filter((other) => other !== timer);
      this.current = timer.dueAt;
      timer.callback();
      await flushAsyncWork();
    }
    this.current = target;
  }

  private nextDue(target: number): Timer | undefined {
    return this.timers
      .filter((timer) => timer.dueAt <= target)
      .sort((a, b) => a.dueAt - b.dueAt || a.id - b.id)[0];
  }
}
