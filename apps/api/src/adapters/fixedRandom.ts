import type { Random } from '../ports/random.ts';

/** Random for tests: returns the given values in order, then repeats the last one. */
export class FixedRandom implements Random {
  private index = 0;
  private uuids = 0;
  private readonly values: number[];

  constructor(values: number[] = [0]) {
    this.values = values;
  }

  next(): number {
    const value = this.values[Math.min(this.index, this.values.length - 1)];
    this.index += 1;
    return value ?? 0;
  }

  uuid(): string {
    this.uuids += 1;
    return `id-${this.uuids}`;
  }
}
