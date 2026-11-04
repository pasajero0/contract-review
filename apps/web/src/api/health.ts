import type { Health } from '@lex-poc/contract';

// Trial use of the contract: renaming a field in the schema breaks this file at compile time.
export const sampleHealth: Health = { status: 'ok' };
