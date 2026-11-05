// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setCurrentLawyerId } from '@/api/lawyer';
import {
  LAWYERS,
  completedReview,
  documentBody,
  documentsBody,
  failedReview,
  finding,
  networkError,
  okReply,
  quotaBody,
  renderWithClient,
  runningReview,
  stubFetch,
  type Reply,
} from '@/test-helpers';
import { ReviewPanel } from './ReviewPanel';

const DOC = '/api/documents/d1';

beforeEach(() => {
  localStorage.clear();
  setCurrentLawyerId(LAWYERS[1]!.id);
});

afterEach(() => {
  localStorage.clear();
});

function stubDocument(doc: Reply | Reply[]) {
  return stubFetch({
    [DOC]: doc,
    '/api/quota': okReply(quotaBody()),
    '/api/documents': okReply(documentsBody([])),
  });
}

function renderPanel() {
  return renderWithClient(<ReviewPanel documentId="d1" />);
}

const HIGH = finding({
  clause: '4.2',
  severity: 'high',
  title: 'Unlimited liability clause',
  excerpt: 'The Supplier is liable without limit.',
  explanation: 'Liability should be capped.',
});
const MEDIUM = finding({
  clause: '12.1',
  severity: 'medium',
  title: 'Automatic renewal',
  excerpt: 'The term renews for one year.',
  explanation: 'Renewal needs a notice period.',
});
const LOW = finding({
  clause: '15',
  severity: 'low',
  title: 'Notice by email',
  excerpt: 'Notices may be sent by email.',
  explanation: 'Email notice is weak evidence.',
});

const reviewWith = (findings = [HIGH, MEDIUM, LOW]) =>
  completedReview({ findings, counts: { high: 1, medium: 1, low: 1 } });

const findingItems = () => within(screen.getByRole('list')).getAllByRole('listitem');

describe('Review result', () => {
  it('read-result AC-9: a completed review shows its heading line, the three counts and every field of each finding', async () => {
    stubDocument(okReply(documentBody({ latestCompleted: reviewWith() })));
    renderPanel();

    const region = await screen.findByRole('region', { name: 'Review result' });
    // 12:00 UTC on 28 October is 13:00 in Europe/Rome.
    expect(region.textContent).toContain('Review result · 28 Oct 2026, 13:00 · requested by Sam Senior');
    expect(region.textContent).toContain('1 high · 1 medium · 1 low');

    const items = within(within(region).getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    [HIGH, MEDIUM, LOW].forEach((f, i) => {
      const text = items[i]!.textContent ?? '';
      expect(text).toMatch(new RegExp(f.severity, 'i'));
      expect(text).toContain(f.clause!);
      expect(text).toContain(f.title);
      expect(text).toContain(f.excerpt!);
      expect(text).toContain(f.explanation);
    });
  });

  it('read-result AC-9: findings appear in the order the API gives, not sorted by severity', async () => {
    stubDocument(okReply(documentBody({ latestCompleted: reviewWith([LOW, HIGH, MEDIUM]) })));
    renderPanel();

    await screen.findByRole('region', { name: 'Review result' });
    const items = findingItems();
    expect(items).toHaveLength(3);
    expect(items[0]!.textContent).toContain(LOW.title);
    expect(items[1]!.textContent).toContain(HIGH.title);
    expect(items[2]!.textContent).toContain(MEDIUM.title);
  });

  describe.each([
    ['a review is running', documentBody({ current: runningReview(), latestCompleted: null })],
    ['the last review failed', documentBody({ lastFailed: failedReview(), latestCompleted: null })],
  ])('when %s and no review completed', (_name, body) => {
    it('read-result AC-10: shows no finding content and no result block', async () => {
      stubDocument(okReply({ ...body, findings: [HIGH], review: reviewWith() }));
      renderPanel();

      if (body.lastFailed) {
        await screen.findByText(/There is no result\./);
      } else {
        await screen.findByText(/in progress/i);
      }
      expect(screen.queryByRole('list')).toBeNull();
      expect(screen.queryByRole('region', { name: /review result/i })).toBeNull();
      expect(screen.queryByText(HIGH.title)).toBeNull();
      expect(screen.queryByText(HIGH.explanation)).toBeNull();
    });
  });

  describe.each([
    ['a review is running', documentBody({ current: runningReview(), latestCompleted: reviewWith() }), 'Previous review'],
    ['the last review failed', documentBody({ lastFailed: failedReview(), latestCompleted: reviewWith() }), 'Earlier result'],
  ])('when %s and an earlier review completed', (_name, body, label) => {
    it('read-result AC-10: findings show only under "Previous review" during a run and "Earlier result" after a failure, never as "Review result"', async () => {
      stubDocument(okReply(body));
      renderPanel();

      const previous = await screen.findByRole('region', { name: label });
      expect(within(previous).getByRole('list')).toBeTruthy();
      expect(within(previous).getByText(HIGH.title, { exact: false })).toBeTruthy();
      expect(previous.textContent).toContain(`${label} · `);
      expect(screen.queryByRole('region', { name: 'Review result' })).toBeNull();
      expect(screen.queryByText(/^Review result/)).toBeNull();
      expect(screen.getAllByRole('list')).toHaveLength(1);
    });
  });

  it('read-result AC-11: a finding with no clause shows "Not in the contract" and no excerpt', async () => {
    const noClause = finding({
      clause: null,
      excerpt: null,
      severity: 'medium',
      title: 'No governing law',
      explanation: 'The contract names no governing law.',
    });
    stubDocument(okReply(documentBody({ latestCompleted: reviewWith([HIGH, noClause]) })));
    renderPanel();

    await screen.findByRole('region', { name: 'Review result' });
    const items = findingItems();
    const item = items.find((i) => (i.textContent ?? '').includes(noClause.title))!;
    expect(item.textContent).toContain('Not in the contract');
    expect(item.textContent).toContain(noClause.explanation);
    expect(item.textContent).not.toMatch(/null|undefined/);
    expect(item.textContent).not.toContain(HIGH.excerpt!);
    // The finding that has a clause does not say it is missing.
    const other = items.find((i) => (i.textContent ?? '').includes(HIGH.title))!;
    expect(other.textContent).not.toContain('Not in the contract');
    expect(other.textContent).toContain(HIGH.excerpt!);
  });

  it('read-result AC-12: a completed review with no findings says no issues were flagged, with no empty list', async () => {
    stubDocument(
      okReply(
        documentBody({
          latestCompleted: completedReview({ findings: [], counts: { high: 0, medium: 0, low: 0 } }),
        }),
      ),
    );
    renderPanel();

    const region = await screen.findByRole('region', { name: 'Review result' });
    expect(within(region).getByText('Reviewed — no issues flagged.')).toBeTruthy();
    expect(region.textContent).toContain('0 high · 0 medium · 0 low');
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('read-result AC-13: a superseded version is Read-only, with a banner and link at the quota time zone, and no request button', async () => {
    // 23:30 on 23 September in UTC, 01:30 on 24 September in Europe/Rome.
    const uploadedAt = Date.UTC(2026, 8, 23, 23, 30, 0);
    stubDocument(
      okReply(
        documentBody({
          latestCompleted: reviewWith(),
          canRequest: { allowed: false, reason: 'document_superseded', currentVersionId: 'd2' },
          supersededBy: { documentId: 'd2', uploadedAt },
        }),
      ),
    );
    renderPanel();

    await screen.findByRole('region', { name: /review result/i });
    expect(screen.getAllByText(/read-only/i).length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain('This version was replaced by the version of 24 Sep');
    expect(document.body.textContent).not.toContain('version of 23 Sep');
    const link = screen
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === '/documents/d2');
    expect(link).toBeTruthy();
    expect(screen.getAllByText(/review of an outdated version/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /request review/i })).toBeNull();
    // The findings are still readable on the same panel.
    expect(findingItems()).toHaveLength(3);
  });

  it('read-result AC-13: a current version has no Read-only mark, banner or outdated label', async () => {
    stubDocument(okReply(documentBody({ latestCompleted: reviewWith(), supersededBy: null })));
    renderPanel();

    await screen.findByRole('region', { name: 'Review result' });
    expect(screen.queryByText(/read-only/i)).toBeNull();
    expect(screen.queryByText(/replaced by the version/i)).toBeNull();
    expect(screen.queryByText(/outdated version/i)).toBeNull();
    expect(screen.getByRole('button', { name: /request review/i })).toBeTruthy();
  });

  describe.each([
    ['the API does not answer', networkError()],
    ['the response fails validation', okReply({ documentId: 'd1', latestCompleted: { findings: 'nope' } })],
  ])('when %s', (_name, failure) => {
    it('read-result AC-14: shows a short error and Retry with no findings; Retry repeats the call and shows the findings', async () => {
      const user = userEvent.setup();
      const stub = stubDocument([failure, okReply(documentBody({ latestCompleted: reviewWith() }))]);
      renderPanel();

      await screen.findByRole('alert');
      expect(screen.queryByRole('list')).toBeNull();
      expect(screen.queryByText(HIGH.title)).toBeNull();
      expect(stub.count(DOC)).toBe(1);

      await user.click(screen.getByRole('button', { name: 'Retry' }));

      await screen.findByRole('region', { name: 'Review result' });
      expect(stub.count(DOC)).toBe(2);
      expect(findingItems()).toHaveLength(3);
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });
});
