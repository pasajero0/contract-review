import { afterEach, vi } from 'vitest';

// Testing Library only auto-cleans when `afterEach` is a global; ours is not.
// In Node tests (no DOM) this does nothing.
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (typeof document === 'undefined') return;
  const { cleanup } = await import('@testing-library/react');
  cleanup();
  localStorage.clear();
});

// jsdom lacks a few browser APIs that Radix UI (used by the shadcn Select) calls.
if (typeof window !== 'undefined') {
  const proto = window.HTMLElement.prototype;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => {};
  proto.releasePointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
