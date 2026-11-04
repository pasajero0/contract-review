// Pure formatting helpers. They take values from the API and never read the clock.

/** "3 Nov 2026, 12:00" in the browser's time zone (the list response has no time zone). */
export function formatDateTime(epochMs: number): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(epochMs);
}

/** "1 December" in the given time zone. */
export function formatDayMonth(epochMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone }).format(epochMs);
}
