export type MonthWindow = {
  /** Calendar month in the time zone, for example 2026-11. */
  month: string;
  /** First instant of the month, inclusive. */
  startMs: number;
  /** First instant of the next month, exclusive. */
  endMs: number;
};

type LocalTime = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function localTime(instantMs: number, timeZone: string): LocalTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(instantMs);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function offsetMs(instantMs: number, timeZone: string): number {
  const local = localTime(instantMs, timeZone);
  const localAsUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  return localAsUtc - Math.floor(instantMs / 1000) * 1000;
}

// Month is 1-based; 13 means January of the next year, because Date.UTC rolls it over.
function startOfMonth(year: number, month: number, timeZone: string): number {
  const asUtc = Date.UTC(year, month - 1, 1);
  // Two passes: the offset at the guess can differ from the offset at the real instant.
  const firstGuess = asUtc - offsetMs(asUtc, timeZone);
  return asUtc - offsetMs(firstGuess, timeZone);
}

export function monthWindow(instantMs: number, timeZone: string): MonthWindow {
  const { year, month } = localTime(instantMs, timeZone);

  return {
    month: `${year}-${String(month).padStart(2, '0')}`,
    startMs: startOfMonth(year, month, timeZone),
    endMs: startOfMonth(year, month + 1, timeZone),
  };
}
