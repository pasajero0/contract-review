import { describe, expect, it } from 'vitest';
import { monthWindow } from './monthWindow.ts';

const ROME = 'Europe/Rome';
const SOFIA = 'Europe/Sofia';

describe('monthWindow', () => {
  it('puts 2026-10-31 23:30 in Rome in October', () => {
    // Rome is UTC+1 after the clock change on 25 October.
    const window = monthWindow(Date.UTC(2026, 9, 31, 22, 30), ROME);

    expect(window.month).toBe('2026-10');
  });

  it('puts 2026-11-01 00:10 in Rome in November', () => {
    const window = monthWindow(Date.UTC(2026, 9, 31, 23, 10), ROME);

    expect(window.month).toBe('2026-11');
    expect(window.startMs).toBe(Date.UTC(2026, 9, 31, 23));
  });

  it('starts the month one hour earlier in UTC in Sofia than in Rome', () => {
    const instant = Date.UTC(2026, 10, 15);

    const rome = monthWindow(instant, ROME);
    const sofia = monthWindow(instant, SOFIA);

    expect(rome.startMs - sofia.startMs).toBe(60 * 60 * 1000);
  });

  it('handles a month with a clock change: its start and end have different offsets', () => {
    const window = monthWindow(Date.UTC(2026, 9, 15), ROME);

    expect(window.startMs).toBe(Date.UTC(2026, 8, 30, 22));
    expect(window.endMs).toBe(Date.UTC(2026, 9, 31, 23));
  });

  it('handles the clock change in March', () => {
    const window = monthWindow(Date.UTC(2026, 2, 15), ROME);

    expect(window.startMs).toBe(Date.UTC(2026, 1, 28, 23));
    expect(window.endMs).toBe(Date.UTC(2026, 2, 31, 22));
  });

  it('handles the year change', () => {
    const window = monthWindow(Date.UTC(2026, 11, 15), ROME);

    expect(window.month).toBe('2026-12');
    expect(window.endMs).toBe(Date.UTC(2026, 11, 31, 23));
  });

  it('includes the start of the month and excludes its end', () => {
    const { startMs, endMs } = monthWindow(Date.UTC(2026, 10, 15), ROME);

    expect(monthWindow(startMs, ROME).month).toBe('2026-11');
    expect(monthWindow(endMs - 1, ROME).month).toBe('2026-11');
    expect(monthWindow(endMs, ROME).month).toBe('2026-12');
  });
});
