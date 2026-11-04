// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { networkError, okReply, quotaBody, rawReply, renderWithClient, stubFetch } from '@/test-helpers';
import { QuotaBar } from './QuotaBar';

describe('QuotaBar', () => {
  it('documents-list AC-18: shows used, running and the reset date in the response time zone', async () => {
    stubFetch({ '/api/quota': okReply(quotaBody()) });

    renderWithClient(<QuotaBar />);

    // resetsAt is 30 November 23:00 UTC, which is 1 December in Europe/Rome.
    await screen.findByText('Used 4 of 10 · 1 running · resets on 1 December');
    expect(screen.queryByText(/30 November/)).toBeNull();
  });

  it('documents-list AC-18: still shows "0 running" when nothing runs', async () => {
    stubFetch({ '/api/quota': okReply(quotaBody({ used: 4, running: 0, remaining: 6 })) });

    renderWithClient(<QuotaBar />);

    await screen.findByText('Used 4 of 10 · 0 running · resets on 1 December');
  });

  it('documents-list AC-22: shows an error and a Retry button when the API does not answer, then the bar after Retry', async () => {
    const user = userEvent.setup();
    const stub = stubFetch({ '/api/quota': [networkError(), okReply(quotaBody())] });

    renderWithClient(<QuotaBar />);

    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await screen.findByText('Used 4 of 10 · 1 running · resets on 1 December');
    expect(stub.count('/api/quota')).toBe(2);
  });

  it('documents-list AC-22: shows an error and a Retry button when the response fails validation', async () => {
    const user = userEvent.setup();
    const stub = stubFetch({
      '/api/quota': [rawReply(200, { ...quotaBody(), used: 'four' }), okReply(quotaBody())],
    });

    renderWithClient(<QuotaBar />);

    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await screen.findByText('Used 4 of 10 · 1 running · resets on 1 December');
    expect(stub.count('/api/quota')).toBe(2);
  });
});
