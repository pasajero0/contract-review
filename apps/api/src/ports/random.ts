export interface Random {
  /** A number in [0, 1). */
  next(): number;
  uuid(): string;
}
