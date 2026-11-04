import { describe, expect, it } from 'vitest';
import { ManualClock } from './manualClock.ts';

describe('ManualClock', () => {
  it('moves time only when advanced', async () => {
    const clock = new ManualClock(1000);

    expect(clock.now()).toBe(1000);
    await clock.advance(500);
    expect(clock.now()).toBe(1500);
  });

  it('runs due timers in order, each at its own time', async () => {
    const clock = new ManualClock(0);
    const fired: Array<[string, number]> = [];
    clock.setTimeout(() => fired.push(['late', clock.now()]), 200);
    clock.setTimeout(() => fired.push(['early', clock.now()]), 100);
    clock.setTimeout(() => fired.push(['never', clock.now()]), 301);

    await clock.advance(300);

    expect(fired).toEqual([
      ['early', 100],
      ['late', 200],
    ]);
    expect(clock.now()).toBe(300);
  });

  it('does not run a cleared timer', async () => {
    const clock = new ManualClock(0);
    let fired = false;
    const timer = clock.setTimeout(() => (fired = true), 100);

    clock.clearTimeout(timer);
    await clock.advance(100);

    expect(fired).toBe(false);
  });

  it('runs a timer set by an async continuation within the same advance', async () => {
    const clock = new ManualClock(0);
    const sleep = (ms: number) =>
      new Promise<void>((resolve) => clock.setTimeout(resolve, ms));
    const reached: number[] = [];

    void (async () => {
      await sleep(100);
      reached.push(clock.now());
      await sleep(100);
      reached.push(clock.now());
    })();
    await clock.advance(250);

    expect(reached).toEqual([100, 200]);
  });
});
