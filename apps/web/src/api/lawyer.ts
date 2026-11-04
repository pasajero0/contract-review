const KEY = 'lex.lawyerId';

const listeners = new Set<() => void>();

// During server rendering there is no localStorage: no lawyer is chosen.
export function getCurrentLawyerId(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(KEY);
}

export function setCurrentLawyerId(id: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(KEY, id);
  listeners.forEach((listener) => listener());
}

/** For `useSyncExternalStore`: called after the chosen lawyer changes. */
export function subscribeToLawyerId(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
