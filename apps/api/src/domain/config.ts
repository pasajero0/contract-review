export type Config = {
  planLimit: number;
  reviewTimeoutMs: number;
  timeZone: string;
  sweepIntervalMs: number;
};

export const DEFAULT_CONFIG: Config = {
  planLimit: 10,
  reviewTimeoutMs: 60_000,
  timeZone: 'Europe/Rome',
  sweepIntervalMs: 5_000,
};
