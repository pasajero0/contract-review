export type TimerHandle = unknown;

export interface Clock {
  /** Current time in epoch milliseconds. */
  now(): number;
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}
