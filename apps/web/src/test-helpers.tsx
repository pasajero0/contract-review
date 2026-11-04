import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, within } from '@testing-library/react';
import { vi } from 'vitest';
import type { DocumentListItem, DocumentsResponse } from '@lex-poc/contract/documents';
import type { Lawyer, LawyersResponse } from '@lex-poc/contract/lawyers';
import type { QuotaResponse } from '@lex-poc/contract/quota';

// ---- fetch stub ----------------------------------------------------------------------------

export type Reply = { kind: 'response'; status: number; body: unknown } | { kind: 'network-error' };

/** A response whose body is checked against its contract type at compile time. */
export function okReply<T>(body: T): Reply {
  return { kind: 'response', status: 200, body };
}

/** A response with any status and any body, for the unhappy paths. */
export function rawReply(status: number, body: unknown): Reply {
  return { kind: 'response', status, body };
}

export function networkError(): Reply {
  return { kind: 'network-error' };
}

export type FetchCall = { path: string; headers: Headers };

export type FetchStub = {
  /** Every call so far, in order. */
  calls: FetchCall[];
  /** Number of calls to one path, e.g. `/api/documents`. */
  count(path: string): number;
};

/**
 * Replaces `fetch` for the current test. For each path give one reply (repeated forever) or a
 * list of replies used in order (the last one repeats). A path that is not listed fails the test.
 */
export function stubFetch(routes: Record<string, Reply | Reply[]>): FetchStub {
  const calls: FetchCall[] = [];
  const used: Record<string, number> = {};

  const fetchStub = vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    calls.push({ path, headers: new Headers(init?.headers) });

    const route = routes[path];
    if (route === undefined) return Promise.reject(new Error(`Unexpected fetch of ${path}`));

    const replies = Array.isArray(route) ? route : [route];
    const index = Math.min(used[path] ?? 0, replies.length - 1);
    used[path] = (used[path] ?? 0) + 1;
    const reply = replies[index]!;

    if (reply.kind === 'network-error') return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(
      new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchStub);

  return { calls, count: (path) => calls.filter((call) => call.path === path).length };
}

// ---- render --------------------------------------------------------------------------------

/** Renders with a fresh QueryClient that never retries, so a failure shows at once. */
export function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(ui, { wrapper });
}

/** The list item (row) that holds the link with this document title. */
export function rowOf(list: HTMLElement, title: string): HTMLElement {
  const row = within(list)
    .getAllByRole('listitem')
    .find((item) => within(item).queryByRole('link', { name: title }) !== null);
  if (!row) throw new Error(`No list item holds a link named "${title}"`);
  return row;
}

// ---- data built from the contract types ----------------------------------------------------

export const SERVER_TIME = Date.UTC(2026, 10, 4, 12, 0, 0);

export const LAWYERS: Lawyer[] = [
  { id: 'lawyer-1', name: 'Paula Partner', title: 'Partner' },
  { id: 'lawyer-2', name: 'Sam Senior', title: 'Senior associate' },
  { id: 'lawyer-3', name: 'Tina Trainee', title: 'Trainee lawyer' },
];

export function lawyersBody(): LawyersResponse {
  return { lawyers: LAWYERS };
}

export function quotaBody(overrides: Partial<QuotaResponse> = {}): QuotaResponse {
  return {
    limit: 10,
    used: 4,
    running: 1,
    remaining: 5,
    month: '2026-11',
    // 1 December 00:00 in Europe/Rome; still 30 November in UTC.
    resetsAt: Date.UTC(2026, 10, 30, 23, 0, 0),
    timeZone: 'Europe/Rome',
    ...overrides,
  };
}

export function listItem(overrides: Partial<DocumentListItem> & { documentId: string; title: string }): DocumentListItem {
  return {
    type: 'contract',
    pages: 3,
    supersededBy: null,
    state: { kind: 'not_reviewed' },
    ...overrides,
  };
}

export function documentsBody(
  documents: DocumentListItem[],
  serverTime: number = SERVER_TIME,
): DocumentsResponse {
  return { documents, serverTime };
}
