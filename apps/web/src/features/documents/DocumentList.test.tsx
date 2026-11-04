// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DocumentListItem, DocumentState } from '@lex-poc/contract/documents';
import {
  SERVER_TIME,
  documentsBody,
  listItem,
  networkError,
  okReply,
  rawReply,
  renderWithClient,
  rowOf,
  stubFetch,
} from '@/test-helpers';
import { DocumentList } from './DocumentList';

const DOCUMENTS = '/api/documents';
const REQUESTED_AT = Date.UTC(2026, 10, 3, 12, 0, 0);

function completed(overrides: Partial<Extract<DocumentState, { kind: 'completed' }>> = {}): DocumentState {
  return {
    kind: 'completed',
    reviewId: 'r-done',
    requestedBy: 'Sam Senior',
    requestedAt: REQUESTED_AT,
    findingsCount: 5,
    highCount: 2,
    ...overrides,
  };
}

function inProgress(overrides: Partial<Extract<DocumentState, { kind: 'in_progress' }>> = {}): DocumentState {
  return {
    kind: 'in_progress',
    reviewId: 'r-run',
    requestedBy: 'Tina Trainee',
    requestedAt: SERVER_TIME - 23_000,
    deadlineAt: SERVER_TIME + 37_000,
    findingsCount: 3,
    ...overrides,
  };
}

async function renderList(items: DocumentListItem[], serverTime = SERVER_TIME) {
  const stub = stubFetch({ [DOCUMENTS]: okReply(documentsBody(items, serverTime)) });
  renderWithClient(<DocumentList />);
  const list = await screen.findByRole('list');
  return { stub, list };
}

describe('DocumentList', () => {
  it('documents-list AC-14: lists every document as a link to its page, with who requested the latest review and when', async () => {
    const { list } = await renderList([
      listItem({ documentId: 'd1', title: 'Alpha NDA', state: completed({ requestedBy: 'Sam Senior' }) }),
      listItem({ documentId: 'd2', title: 'Beta Lease', state: inProgress({ requestedBy: 'Tina Trainee' }) }),
      listItem({
        documentId: 'd3',
        title: 'Gamma Supply',
        state: {
          kind: 'failed',
          reviewId: 'r-fail',
          requestedBy: 'Paula Partner',
          requestedAt: REQUESTED_AT,
          failureReason: 'ai_error',
          findingsCount: 0,
          latestCompleted: null,
        },
      }),
    ]);

    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByRole('link', { name: 'Alpha NDA' }).getAttribute('href')).toBe('/documents/d1');
    expect(within(list).getByRole('link', { name: 'Beta Lease' }).getAttribute('href')).toBe('/documents/d2');
    expect(within(list).getByRole('link', { name: 'Gamma Supply' }).getAttribute('href')).toBe('/documents/d3');

    expect(rowOf(list, 'Alpha NDA').textContent).toContain('Sam Senior');
    expect(rowOf(list, 'Beta Lease').textContent).toContain('Tina Trainee');
    expect(rowOf(list, 'Gamma Supply').textContent).toContain('Paula Partner');
    // The exact date format is not fixed; the year proves a date is shown.
    expect(rowOf(list, 'Alpha NDA').textContent).toContain('2026');
  });

  it('documents-list AC-15: shows "not reviewed" for a document with no reviews', async () => {
    const { list } = await renderList([listItem({ documentId: 'd1', title: 'Alpha NDA' })]);

    expect(within(rowOf(list, 'Alpha NDA')).getByText(/not reviewed/i)).toBeTruthy();
  });

  it('documents-list AC-16: shows "in progress", findings so far and elapsed seconds computed from serverTime', async () => {
    // serverTime is far from the browser clock, so elapsed time computed in the browser would differ.
    const serverTime = Date.UTC(2001, 8, 9, 1, 46, 40);
    const { list } = await renderList(
      [
        listItem({
          documentId: 'd1',
          title: 'Alpha NDA',
          state: inProgress({
            requestedAt: serverTime - 23_000,
            deadlineAt: serverTime + 37_000,
            findingsCount: 3,
          }),
        }),
      ],
      serverTime,
    );

    const row = within(rowOf(list, 'Alpha NDA'));
    expect(row.getByText(/in progress/i)).toBeTruthy();
    expect(row.getByText(/3 findings so far/i)).toBeTruthy();
    expect(row.getByText(/23 s of 60/)).toBeTruthy();
  });

  it('documents-list AC-16: polls while a review is in progress and stops when none is', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    const running = listItem({ documentId: 'd1', title: 'Alpha NDA', state: inProgress() });
    const done = listItem({ documentId: 'd1', title: 'Alpha NDA', state: completed() });
    const stub = stubFetch({
      [DOCUMENTS]: [
        okReply(documentsBody([running])),
        okReply(documentsBody([running])),
        okReply(documentsBody([done])),
      ],
    });

    renderWithClient(<DocumentList />);
    await advance(0);
    expect(stub.count(DOCUMENTS)).toBe(1);

    // Three fetches in all: two "in progress", then "completed". Then it must stop.
    await advance(60_000);
    expect(stub.count(DOCUMENTS)).toBe(3);
    expect(screen.queryByText(/in progress/i)).toBeNull();

    await advance(600_000);
    expect(stub.count(DOCUMENTS)).toBe(3);
  });

  it('documents-list AC-16: does not poll when no review is in progress', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    const stub = stubFetch({
      [DOCUMENTS]: okReply(
        documentsBody([
          listItem({ documentId: 'd1', title: 'Alpha NDA', state: completed() }),
          listItem({ documentId: 'd2', title: 'Beta Lease' }),
        ]),
      ),
    });

    renderWithClient(<DocumentList />);
    await advance(0);
    await advance(600_000);

    expect(stub.count(DOCUMENTS)).toBe(1);
  });

  it('documents-list AC-17: shows the number of findings and how many are high for a completed review', async () => {
    const { list } = await renderList([
      listItem({ documentId: 'd1', title: 'Alpha NDA', state: completed({ findingsCount: 5, highCount: 2 }) }),
    ]);

    const row = rowOf(list, 'Alpha NDA').textContent ?? '';
    expect(row).toMatch(/5 findings/);
    expect(row).toMatch(/2 high/);
  });

  it('documents-list AC-19: lists a superseded version right after its current version, marked "Read-only", in the order given', async () => {
    // Neither a sort by title nor a sort by date gives this order.
    const { list } = await renderList([
      listItem({ documentId: 'd-z', title: 'Zeta Lease v2' }),
      listItem({
        documentId: 'd-z1',
        title: 'Zeta Lease v1',
        supersededBy: { documentId: 'd-z', uploadedAt: REQUESTED_AT },
      }),
      listItem({ documentId: 'd-a', title: 'Alpha NDA' }),
    ]);

    const titles = within(list).getAllByRole('link').map((link) => link.textContent);
    expect(titles).toEqual(['Zeta Lease v2', 'Zeta Lease v1', 'Alpha NDA']);

    expect(within(rowOf(list, 'Zeta Lease v1')).getByText(/read-only/i)).toBeTruthy();
    expect(within(rowOf(list, 'Zeta Lease v2')).queryByText(/read-only/i)).toBeNull();
    expect(within(rowOf(list, 'Alpha NDA')).queryByText(/read-only/i)).toBeNull();
  });

  it('documents-list AC-20: shows the failure reason and, below it, the latest completed review', async () => {
    const { list } = await renderList([
      listItem({
        documentId: 'd1',
        title: 'Alpha NDA',
        state: {
          kind: 'failed',
          reviewId: 'r-fail',
          requestedBy: 'Paula Partner',
          requestedAt: REQUESTED_AT,
          failureReason: 'timeout',
          findingsCount: 0,
          latestCompleted: {
            reviewId: 'r-old',
            requestedBy: 'Sam Senior',
            requestedAt: REQUESTED_AT - 86_400_000,
            findingsCount: 6,
            highCount: 3,
          },
        },
      }),
    ]);

    const row = within(rowOf(list, 'Alpha NDA'));
    // The wording of the reason is not fixed; it must say the review timed out.
    const reason = row.getByText(/timed out|timeout/i);
    const summary = row.getByText(/6 findings/);
    expect(rowOf(list, 'Alpha NDA').textContent).toMatch(/3 high/);
    expect(reason.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('documents-list AC-20: shows no completed-review summary when there is none', async () => {
    const { list } = await renderList([
      listItem({
        documentId: 'd1',
        title: 'Alpha NDA',
        state: {
          kind: 'failed',
          reviewId: 'r-fail',
          requestedBy: 'Paula Partner',
          requestedAt: REQUESTED_AT,
          failureReason: 'timeout',
          findingsCount: 0,
          latestCompleted: null,
        },
      }),
    ]);

    const row = within(rowOf(list, 'Alpha NDA'));
    expect(row.getByText(/timed out|timeout/i)).toBeTruthy();
    expect(row.queryByText(/high/i)).toBeNull();
    expect(row.queryByText(/completed/i)).toBeNull();
  });

  it('documents-list AC-21: shows "completed, no issues flagged" for a completed review without findings, unlike "not reviewed"', async () => {
    const { list } = await renderList([
      listItem({
        documentId: 'd1',
        title: 'Delta Advisory',
        state: completed({ findingsCount: 0, highCount: 0 }),
      }),
      listItem({ documentId: 'd2', title: 'Beta Lease' }),
    ]);

    const empty = within(rowOf(list, 'Delta Advisory'));
    expect(empty.getByText(/completed, no issues flagged/i)).toBeTruthy();
    expect(empty.queryByText(/not reviewed/i)).toBeNull();

    const unreviewed = within(rowOf(list, 'Beta Lease'));
    expect(unreviewed.getByText(/not reviewed/i)).toBeTruthy();
    expect(unreviewed.queryByText(/completed, no issues flagged/i)).toBeNull();
  });

  describe.each([
    ['the API does not answer', networkError()],
    ['the API answers 500', rawReply(500, { message: 'boom' })],
    ['the response fails validation', rawReply(200, { documents: 'not a list', serverTime: 'x' })],
  ])('when %s', (_name, failure) => {
    it('documents-list AC-22: shows an error and a Retry button; Retry repeats the call and then shows the list', async () => {
      const user = userEvent.setup();
      const stub = stubFetch({
        [DOCUMENTS]: [failure, okReply(documentsBody([listItem({ documentId: 'd1', title: 'Alpha NDA' })]))],
      });

      renderWithClient(<DocumentList />);

      await screen.findByRole('alert');
      expect(screen.queryByRole('list')).toBeNull();
      expect(stub.count(DOCUMENTS)).toBe(1);

      await user.click(screen.getByRole('button', { name: 'Retry' }));

      const list = await screen.findByRole('list');
      expect(within(list).getByRole('link', { name: 'Alpha NDA' })).toBeTruthy();
      expect(stub.count(DOCUMENTS)).toBe(2);
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
