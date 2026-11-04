import type { IncomingFinding } from '../domain/review.ts';
import type { Clock } from '../ports/clock.ts';
import type { Random } from '../ports/random.ts';
import type { ReviewEngine } from '../ports/reviewEngine.ts';

export type FakeEngineOptions = {
  clock: Clock;
  random: Random;
  findingsByDocument: ReadonlyMap<string, readonly IncomingFinding[]>;
};

// Scenario limits on a value in [0, 1): 1 in 5 fails, 1 in 10 is slow, the rest are normal.
const FAILS_BELOW = 0.2;
const SLOW_BELOW = 0.3;
const NORMAL_MS = { min: 5_000, max: 30_000 };
const SLOW_MS = { min: 60_000, max: 120_000 };

export function createFakeEngine({ clock, random, findingsByDocument }: FakeEngineOptions): ReviewEngine {
  const sleep = (ms: number) => new Promise<void>((resolve) => clock.setTimeout(resolve, ms));
  const between = ({ min, max }: { min: number; max: number }) =>
    Math.round(min + random.next() * (max - min));

  return {
    async *run(documentId) {
      const findings = findingsByDocument.get(documentId) ?? [];

      const scenario = random.next();
      const fails = scenario < FAILS_BELOW;
      const slow = !fails && scenario < SLOW_BELOW;
      // k from 0 to n, both included.
      const sent = fails ? Math.floor(random.next() * (findings.length + 1)) : findings.length;
      const totalMs = between(slow ? SLOW_MS : NORMAL_MS);
      const stepMs = Math.round(totalMs / (findings.length + 1));

      for (const finding of findings.slice(0, sent)) {
        await sleep(stepMs);
        yield finding;
      }
      await sleep(stepMs);
      if (fails) throw new Error(`fake engine failed after ${sent} findings`);
    },
  };
}
