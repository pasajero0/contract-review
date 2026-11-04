// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DocumentResponse } from '@lex-poc/contract/documents';
import { setCurrentLawyerId } from '@/api/lawyer';
import {
  LAWYERS,
  SERVER_TIME,
  completedReview,
  documentBody,
  documentsBody,
  failedReview,
  networkError,
  okReply,
  quotaBody,
  rawReply,
  renderWithClient,
  runningReview,
  stubFetch,
  type Reply,
} from '@/test-helpers';
import { DocumentList } from '@/features/documents/DocumentList';
import { QuotaBar } from '@/features/quota/QuotaBar';
import { ReviewPanel } from './ReviewPanel';

const DOC = '/api/documents/d1';
const POST = 'POST /api/documents/d1/reviews';
const POST_PATH = '/api/documents/d1/reviews';
const QUOTA = '/api/quota';
const LIST = '/api/documents';

const FAKE: { toFake: Array<'setTimeout' | 'clearTimeout' | 'setInterval' | 'clearInterval'> } = {
  toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
};
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

// TanStack Query shows a result through a zero-delay timer, which fake timers run one millisecond later.
const advanceAndRender = async (ms: number) => {
  await advance(ms);
  await advance(1);
};

const requestButton = () => screen.getByRole('button', { name: /request review/i }) as HTMLButtonElement;

// 14:02 in Europe/Rome (UTC+1 in November), 13:02 in UTC.
const STARTED_AT = Date.UTC(2026, 10, 4, 13, 2, 0);
// 1 December 00:00 in Europe/Rome, still 30 November in UTC.
const RESETS_AT = Date.UTC(2026, 10, 30, 23, 0, 0);

const RUNNING_TEXT = 'A review is already running — started by Riccardo Fanti at 14:02.';
const EXHAUSTED_TEXT = '10 of 10 used. Resets on 1 December.';

const BUSY: DocumentResponse['canRequest'] = {
  allowed: false,
  reason: 'review_in_progress',
  startedBy: 'Tina Trainee',
  startedAt: SERVER_TIME - 20_000,
};

beforeEach(() => {
  localStorage.clear();
  setCurrentLawyerId(LAWYERS[1]!.id);
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

function stubDocument(doc: Reply | Reply[], extra: Record<string, Reply | Reply[]> = {}) {
  return stubFetch({
    [DOC]: doc,
    [QUOTA]: okReply(quotaBody()),
    [LIST]: okReply(documentsBody([])),
    ...extra,
  });
}

function renderPanel() {
  return renderWithClient(<ReviewPanel documentId="d1" />);
}

/** The panel plus a mounted list and quota bar, so a refresh of their queries is visible as a fetch. */
function renderPanelWithSiblings() {
  return renderWithClient(
    <>
      <ReviewPanel documentId="d1" />
      <DocumentList />
      <QuotaBar />
    </>,
  );
}

function allowed(remaining: number): DocumentResponse {
  return documentBody({ canRequest: { allowed: true, remaining } });
}

describe('ReviewPanel', () => {
  it('request-review AC-22: asks for confirmation with the remaining count; cancelling sends no request', async () => {
    const user = userEvent.setup();
    const stub = stubDocument(okReply(allowed(6)));
    renderPanel();

    await screen.findByRole('button', { name: /request review/i });
    await user.click(requestButton());

    await screen.findByText('This uses 1 of your 6 remaining reviews — only if it completes.');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText(/this uses 1 of your/i)).toBeNull();
    expect(stub.count(POST_PATH, 'POST')).toBe(0);
  });

  it('request-review AC-23: says it is the last review when one slot remains', async () => {
    const user = userEvent.setup();
    stubDocument(okReply(allowed(1)));
    renderPanel();

    await screen.findByRole('button', { name: /request review/i });
    await user.click(requestButton());

    await screen.findByText('This is the last review available this month.');
  });

  it('request-review AC-24: confirming sends one POST with X-Lawyer-Id, then follows the review', async () => {
    const user = userEvent.setup();
    const stub = stubDocument(
      [okReply(allowed(6)), okReply(documentBody({ current: runningReview() }))],
      { [POST]: rawReply(201, { reviewId: 'r-new' }) },
    );
    renderPanel();

    await screen.findByRole('button', { name: /request review/i });
    expect(stub.count(DOC)).toBe(1);
    await user.click(requestButton());
    await user.click(await screen.findByRole('button', { name: 'Confirm' }));

    await screen.findByText(/in progress/i);
    expect(stub.count(POST_PATH, 'POST')).toBe(1);
    const post = stub.calls.find((call) => call.method === 'POST')!;
    expect(post.headers.get('X-Lawyer-Id')).toBe(LAWYERS[1]!.id);
    expect(stub.count(DOC)).toBeGreaterThanOrEqual(2);
  });

  it('request-review AC-24: after a successful request the document, the list and the quota are refreshed', async () => {
    const user = userEvent.setup();
    const stub = stubDocument(
      [okReply(allowed(6)), okReply(documentBody({ current: runningReview() }))],
      { [POST]: rawReply(201, { reviewId: 'r-new' }) },
    );
    renderPanelWithSiblings();

    await screen.findByRole('button', { name: /request review/i });
    await screen.findByText(/Used 4 of 10/);
    const listBefore = stub.count(LIST);
    const quotaBefore = stub.count(QUOTA);
    expect(listBefore).toBeGreaterThan(0);

    await user.click(requestButton());
    await user.click(await screen.findByRole('button', { name: 'Confirm' }));
    await screen.findAllByText(/in progress/i);

    expect(stub.count(LIST)).toBeGreaterThan(listBefore);
    expect(stub.count(QUOTA)).toBeGreaterThan(quotaBefore);
  });

  it('request-review AC-24: with no lawyer chosen the button is disabled, says to choose first, and sends nothing', async () => {
    const user = userEvent.setup();
    localStorage.clear();
    const stub = stubDocument(okReply(allowed(6)));
    renderPanel();

    await screen.findByText('Choose who you are first');
    const button = requestButton();
    expect(button.disabled).toBe(true);

    await user.click(button);

    expect(screen.queryByText(/this uses 1 of your/i)).toBeNull();
    expect(stub.count(POST_PATH, 'POST')).toBe(0);
  });

  it('request-review AC-25: shows the running review from serverTime, shows none of its findings, and polls', async () => {
    vi.useFakeTimers(FAKE);
    // serverTime is far from the browser clock, so elapsed time taken from the browser would differ.
    const serverTime = Date.UTC(2001, 8, 9, 1, 46, 40);
    const secret = {
      clause: '4.2',
      title: 'Unlimited liability clause',
      severity: 'high' as const,
      excerpt: 'Secret excerpt text',
      explanation: 'Secret explanation text',
    };
    const body = {
      ...documentBody({
        serverTime,
        current: runningReview({
          requestedBy: 'Tina Trainee',
          requestedAt: serverTime - 20_000,
          deadlineAt: serverTime + 40_000,
          findingsCount: 3,
        }),
        latestCompleted: null,
        canRequest: { ...BUSY, startedAt: serverTime - 20_000 },
      }),
      // An extra field the contract does not know: it must not reach the screen.
      findings: [secret],
    };
    const stub = stubDocument(okReply(body));

    renderPanel();
    await advance(0);

    screen.getByText('In progress · requested by Tina Trainee · 3 findings so far · 20 s of 60');
    expect(screen.queryByText(/Unlimited liability/)).toBeNull();
    expect(screen.queryByText(/Secret/)).toBeNull();

    expect(stub.count(DOC)).toBe(1);
    await advance(1500);
    expect(stub.count(DOC)).toBe(2);
    await advance(1500);
    expect(stub.count(DOC)).toBe(3);
    await advance(3000);
    expect(stub.count(DOC)).toBe(5);
  });

  it('request-review AC-26: shows the previous review as a separate block, with a banner that a new review runs', async () => {
    vi.useFakeTimers(FAKE);
    stubDocument(
      okReply(
        documentBody({
          current: runningReview(),
          latestCompleted: completedReview({ requestedBy: 'Sam Senior' }),
          canRequest: BUSY,
        }),
      ),
    );

    renderPanel();
    await advance(0);

    const block = screen.getByRole('region', { name: /previous review/i });
    expect(block.textContent).toContain('Previous review');
    expect(block.textContent).toContain('Sam Senior');
    expect(block.textContent).toContain('2026');
    // The progress line and the banner are outside the block.
    expect(within(block).queryByText(/in progress/i)).toBeNull();
    expect(within(block).queryByText(/new review is running/i)).toBeNull();
    screen.getByText(/in progress · requested by Tina Trainee/i);
    expect(screen.getByText(/new review is running/i)).toBeTruthy();
  });

  it('request-review AC-26: shows neither the block nor the banner when no earlier review completed', async () => {
    vi.useFakeTimers(FAKE);
    stubDocument(okReply(documentBody({ current: runningReview(), canRequest: BUSY })));

    renderPanel();
    await advance(0);

    screen.getByText(/in progress · requested by Tina Trainee/i);
    expect(screen.queryByRole('region', { name: /previous review/i })).toBeNull();
    expect(screen.queryByText(/previous review/i)).toBeNull();
    expect(screen.queryByText(/new review is running/i)).toBeNull();
  });

  it('request-review AC-27: when the review completes, polling stops, the previous-review block goes, and list and quota are refreshed', async () => {
    vi.useFakeTimers(FAKE);
    const running = documentBody({
      current: runningReview(),
      latestCompleted: completedReview({ requestedBy: 'Sam Senior' }),
      canRequest: BUSY,
    });
    const done = documentBody({
      current: null,
      latestCompleted: completedReview({
        reviewId: 'r-new',
        requestedBy: 'Tina Trainee',
        requestedAt: SERVER_TIME - 30_000,
      }),
    });
    const stub = stubDocument([okReply(running), okReply(done)]);

    renderPanelWithSiblings();
    await advance(0);
    screen.getByRole('region', { name: /previous review/i });
    const listBefore = stub.count(LIST);
    const quotaBefore = stub.count(QUOTA);

    await advanceAndRender(1500);

    expect(screen.queryByText(/in progress · requested by/i)).toBeNull();
    expect(screen.queryByRole('region', { name: /previous review/i })).toBeNull();
    expect(screen.queryByText(/previous review/i)).toBeNull();
    expect(stub.count(LIST)).toBeGreaterThan(listBefore);
    expect(stub.count(QUOTA)).toBeGreaterThan(quotaBefore);

    const docCalls = stub.count(DOC);
    await advance(60_000);
    expect(stub.count(DOC)).toBe(docCalls);
  });

  it('request-review AC-28: disables the button and names who started the running review, at the quota time zone', async () => {
    stubDocument(
      okReply(
        documentBody({
          canRequest: { allowed: false, reason: 'review_in_progress', startedBy: 'Riccardo Fanti', startedAt: STARTED_AT },
        }),
      ),
    );
    renderPanel();

    await screen.findByText(RUNNING_TEXT);
    expect(requestButton().disabled).toBe(true);
  });

  it('request-review AC-29: disables the button and says the plan is used up, with the reset date in the quota time zone', async () => {
    stubDocument(
      okReply(
        documentBody({ canRequest: { allowed: false, reason: 'plan_exhausted', limit: 10, resetsAt: RESETS_AT } }),
      ),
    );
    renderPanel();

    await screen.findByText(EXHAUSTED_TEXT);
    expect(screen.queryByText(/30 November/)).toBeNull();
    expect(requestButton().disabled).toBe(true);
  });

  describe.each([
    [
      'review_in_progress',
      { code: 'review_in_progress', startedBy: 'Riccardo Fanti', startedAt: STARTED_AT },
      RUNNING_TEXT,
    ],
    ['plan_exhausted', { code: 'plan_exhausted', resetsAt: RESETS_AT }, EXHAUSTED_TEXT],
    ['document_superseded', { code: 'document_superseded', currentVersionId: 'd2' }, /read-only/i],
  ])('when the server rejects a request with %s', (_code, errorBody, reasonText) => {
    it('request-review AC-30: shows the same reason as the page would, and no progress line', async () => {
      const user = userEvent.setup();
      // The page was stale: it still thought a review could be requested.
      const stub = stubDocument(okReply(allowed(6)), { [POST]: rawReply(409, errorBody) });
      renderPanel();

      await screen.findByRole('button', { name: /request review/i });
      await user.click(requestButton());
      await user.click(await screen.findByRole('button', { name: 'Confirm' }));

      if (typeof reasonText === 'string') await screen.findByText(reasonText);
      else expect((await screen.findAllByText(reasonText)).length).toBeGreaterThan(0);
      expect(stub.count(POST_PATH, 'POST')).toBe(1);
      expect(screen.queryByText(/in progress/i)).toBeNull();
    });
  });

  it('request-review AC-31: a superseded document has no "Request review" button and says Read-only', async () => {
    stubDocument(
      okReply(
        documentBody({
          canRequest: { allowed: false, reason: 'document_superseded', currentVersionId: 'd2' },
          supersededBy: { documentId: 'd2', uploadedAt: SERVER_TIME - 86_400_000 },
        }),
      ),
    );
    renderPanel();

    expect((await screen.findAllByText(/read-only/i)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /request review/i })).toBeNull();
  });

  it('request-review AC-32: a failed review with an AI error says so, offers Retry, and keeps the earlier completed review under its label', async () => {
    stubDocument(
      okReply(
        documentBody({
          lastFailed: failedReview({ failureReason: 'ai_error', findingsCount: 3 }),
          latestCompleted: completedReview({ requestedBy: 'Sam Senior' }),
        }),
      ),
    );
    renderPanel();

    await screen.findByText('Review did not complete: AI error after 3 findings. There is no result.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    const block = screen.getByRole('region', { name: /previous review/i });
    expect(block.textContent).toContain('Sam Senior');
  });

  it('request-review AC-33: a timed-out review says it did not complete within 60 seconds and offers Retry', async () => {
    stubDocument(okReply(documentBody({ lastFailed: failedReview({ failureReason: 'timeout', findingsCount: 0 }) })));
    renderPanel();

    await screen.findByText('Review did not complete within 60 seconds. There is no result.');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('request-review AC-34: Retry on a failed review asks for confirmation; nothing is sent until confirmed', async () => {
    const user = userEvent.setup();
    const stub = stubDocument(okReply(documentBody({ lastFailed: failedReview() })), {
      [POST]: rawReply(201, { reviewId: 'r-new' }),
    });
    renderPanel();

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    await screen.findByText(/this uses 1 of your 6 remaining reviews/i);
    expect(stub.count(POST_PATH, 'POST')).toBe(0);

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    await vi.waitFor(() => expect(stub.count(POST_PATH, 'POST')).toBe(1));
  });

  describe.each([
    ['the API does not answer', networkError()],
    ['the response fails validation', okReply({ documentId: 'd1', current: 'not a review' })],
  ])('when loading the document and %s', (_name, failure) => {
    it('request-review AC-35: shows a short error and Retry; Retry repeats the call and then shows the panel', async () => {
      const user = userEvent.setup();
      const stub = stubDocument([failure, okReply(allowed(6))]);
      renderPanel();

      await screen.findByRole('alert');
      expect(screen.queryByRole('button', { name: /request review/i })).toBeNull();
      expect(stub.count(DOC)).toBe(1);

      await user.click(screen.getByRole('button', { name: 'Retry' }));

      await screen.findByRole('button', { name: /request review/i });
      expect(stub.count(DOC)).toBe(2);
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  it('request-review AC-35: when the POST gets no answer, shows an error and Retry; Retry repeats the POST with no second confirmation', async () => {
    const user = userEvent.setup();
    const stub = stubDocument(okReply(allowed(6)), {
      // The first request may have reached the server: the repeat is rejected as already running.
      [POST]: [
        networkError(),
        rawReply(409, { code: 'review_in_progress', startedBy: 'Riccardo Fanti', startedAt: STARTED_AT }),
      ],
    });
    renderPanel();

    await screen.findByRole('button', { name: /request review/i });
    await user.click(requestButton());
    await user.click(await screen.findByRole('button', { name: 'Confirm' }));

    await screen.findByRole('alert');
    expect(stub.count(POST_PATH, 'POST')).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await screen.findByText(RUNNING_TEXT);
    expect(stub.count(POST_PATH, 'POST')).toBe(2);
    expect(screen.queryByText(/this uses 1 of your/i)).toBeNull();
    expect(screen.queryByText(/did not complete/i)).toBeNull();
  });

  it('request-review AC-35: a refresh that fails during a run keeps the progress line, shows an error, and does not show the review as failed', async () => {
    vi.useFakeTimers(FAKE);
    const running = (findingsCount: number) =>
      okReply(documentBody({ current: runningReview({ findingsCount }), canRequest: BUSY }));
    const stub = stubDocument([running(3), networkError(), running(5)]);

    renderPanel();
    await advance(0);
    screen.getByText(/3 findings so far/);
    expect(screen.queryByRole('alert')).toBeNull();

    await advanceAndRender(1500);
    expect(stub.count(DOC)).toBe(2);
    screen.getByRole('alert');
    screen.getByText(/in progress · requested by Tina Trainee · 3 findings so far/i);
    expect(screen.queryByText(/did not complete/i)).toBeNull();

    // Polling goes on, and when it works again the error goes away.
    await advanceAndRender(1500);
    expect(stub.count(DOC)).toBe(3);
    screen.getByText(/5 findings so far/);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
