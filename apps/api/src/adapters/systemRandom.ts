import { randomUUID } from 'node:crypto';
import type { Random } from '../ports/random.ts';

export const systemRandom: Random = {
  next: () => Math.random(),
  uuid: () => randomUUID(),
};
