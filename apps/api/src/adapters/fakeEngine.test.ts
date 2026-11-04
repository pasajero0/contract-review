import { describe, expect, it } from 'vitest';
import type { IncomingFinding } from '../domain/review.ts';
import { createFakeEngine, type FakeEngineOptions } from './fakeEngine.ts';
import { FixedRandom } from './fixedRandom.ts';
import { ManualClock } from './manualClock.ts';

function finding(title: string): IncomingFinding {
  return { clause: null, title, severity: 'low', excerpt: null, explanation: 'Why' };
}

const THREE = [finding('a'), finding('b'), finding('c')];

/** Runs the engine in the background and records what it sends, and when. */
function observe(options: Omit<FakeEngineOptions, 'clock'>, documentId = 'doc') {
  const clock = new ManualClock(0);
  const engine = createFakeEngine({ ...options, clock });
  const seen = { findings: [] as Array<[string, number]>, doneAt: null as number | null, errorAt: null as number | null };

  void (async () => {
    try {
      for await (const item of engine.run(documentId)) {
        seen.findings.push([item.title, clock.now()]);
      }
      seen.doneAt = clock.now();
    } catch {
      seen.errorAt = clock.now();
    }
  })();

  return { clock, seen };
}

function options(values: number[], findings: IncomingFinding[] = THREE): Omit<FakeEngineOptions, 'clock'> {
  return { random: new FixedRandom(values), findingsByDocument: new Map([['doc', findings]]) };
}

describe('fake engine scenarios', () => {
  it('normal: sends all findings in order, spread over the total time, then finishes', async () => {
    // Scenario 0.5 is normal; duration 0 gives the shortest total, 5 s.
    const { clock, seen } = observe(options([0.5, 0]));

    await clock.advance(5000);

    expect(seen.findings).toEqual([
      ['a', 1250],
      ['b', 2500],
      ['c', 3750],
    ]);
    expect(seen.doneAt).toBe(5000);
  });

  it('normal: the longest total is 30 s', async () => {
    const { clock, seen } = observe(options([0.5, 0.999999]));

    await clock.advance(29_000);
    expect(seen.doneAt).toBeNull();

    await clock.advance(1000);
    expect(seen.doneAt).not.toBeNull();
  });

  it('failure: sends k findings, then fails', async () => {
    // Scenario 0.1 is failure; 0.5 of 4 possible values gives k = 2.
    const { clock, seen } = observe(options([0.1, 0.5, 0]));

    await clock.advance(30_000);

    expect(seen.findings.map(([title]) => title)).toEqual(['a', 'b']);
    expect(seen.errorAt).not.toBeNull();
    expect(seen.doneAt).toBeNull();
  });

  it.each([
    ['k = 0', 0, 0],
    ['k = n', 0.999999, 3],
  ])('failure: %s is possible', async (_name, fraction, sent) => {
    const { clock, seen } = observe(options([0.1, fraction, 0]));

    await clock.advance(30_000);

    expect(seen.findings).toHaveLength(sent);
    expect(seen.errorAt).not.toBeNull();
  });

  it('slow: takes 60 to 120 s in total', async () => {
    // Scenario 0.25 is slow; duration 0 gives 60 s.
    const shortest = observe(options([0.25, 0]));
    await shortest.clock.advance(59_999);
    expect(shortest.seen.doneAt).toBeNull();
    await shortest.clock.advance(1);
    expect(shortest.seen.doneAt).toBe(60_000);

    const longest = observe(options([0.25, 0.999999]));
    await longest.clock.advance(119_000);
    expect(longest.seen.doneAt).toBeNull();
    await longest.clock.advance(1000);
    expect(longest.seen.doneAt).not.toBeNull();
  });

  it('a document with no findings finishes with none', async () => {
    const { clock, seen } = observe(options([0.5, 0], []));

    await clock.advance(5000);

    expect(seen.findings).toEqual([]);
    expect(seen.doneAt).toBe(5000);
  });

  it('a document it does not know has no findings', async () => {
    const { clock, seen } = observe(options([0.5, 0]), 'unknown');

    await clock.advance(5000);

    expect(seen.findings).toEqual([]);
    expect(seen.doneAt).toBe(5000);
  });
});

describe('scenario shares', () => {
  it('fails about 1 in 5, is slow about 1 in 10, otherwise normal', async () => {
    const at = async (scenario: number) => {
      const { clock, seen } = observe(options([scenario, 0, 0]));
      await clock.advance(30_000);
      if (seen.errorAt !== null) return 'failure';
      return seen.doneAt === null ? 'slow' : 'normal';
    };

    expect(await at(0)).toBe('failure');
    expect(await at(0.199)).toBe('failure');
    expect(await at(0.2)).toBe('slow');
    expect(await at(0.299)).toBe('slow');
    expect(await at(0.3)).toBe('normal');
    expect(await at(0.999)).toBe('normal');
  });
});
