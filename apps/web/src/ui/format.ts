// Pure formatting helpers. They take values from the API and never read the clock.

/** "3 Nov 2026, 12:00" in the given time zone. The zone is required so the browser's never slips in. */
export function formatDateTime(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(epochMs);
}

/** "14:02" in the given time zone. */
export function formatTime(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(
    epochMs,
  );
}

/** "1 finding" or "3 findings". */
export function findingCount(n: number): string {
  return n === 1 ? '1 finding' : `${n} findings`;
}

/** Whole seconds from `fromMs` to `toMs`, never below zero. Pass the server's time as `toMs`. */
export function secondsBetween(fromMs: number, toMs: number): number {
  return Math.max(0, Math.floor((toMs - fromMs) / 1000));
}

/** "24 Sep" in the given time zone. */
export function formatShortDayMonth(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone }).format(epochMs);
}

/** "1 December" in the given time zone. */
export function formatDayMonth(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone }).format(epochMs);
}
