// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LawyersResponse } from '@lex-poc/contract/lawyers';
import { LAWYERS, lawyersBody, okReply, renderWithClient, stubFetch } from '@/test-helpers';
import { apiGet } from '@/api/client';
import { getCurrentLawyerId } from '@/api/lawyer';
import { LawyerPicker } from './LawyerPicker';

const LABEL = /who are you\?/i;
const [PARTNER, SENIOR] = [LAWYERS[0]!, LAWYERS[1]!];

// The picker may be a native <select> or a Radix Select; this works with either.
async function pick(user: ReturnType<typeof userEvent.setup>, name: string) {
  const control = await screen.findByRole('combobox', { name: LABEL });
  if (control instanceof HTMLSelectElement) {
    await user.selectOptions(control, name);
  } else {
    await user.click(control);
    await user.click(await screen.findByRole('option', { name }));
  }
}

async function shownChoice(): Promise<string> {
  const control = await screen.findByRole('combobox', { name: LABEL });
  if (control instanceof HTMLSelectElement) return control.selectedOptions[0]?.text ?? '';
  return control.textContent ?? '';
}

describe('LawyerPicker', () => {
  it('documents-list AC-13: shows the picked lawyer, remembers the choice after a remount and sends it as X-Lawyer-Id', async () => {
    const user = userEvent.setup();
    const stub = stubFetch({ '/api/lawyers': okReply(lawyersBody()) });

    const first = renderWithClient(<LawyerPicker />);
    await pick(user, SENIOR.name);

    await waitFor(async () => expect(await shownChoice()).toContain(SENIOR.name));
    expect(await shownChoice()).not.toContain(PARTNER.name);
    expect(getCurrentLawyerId()).toBe(SENIOR.id);

    // The choice survives a remount.
    first.unmount();
    renderWithClient(<LawyerPicker />);
    await waitFor(async () => expect(await shownChoice()).toContain(SENIOR.name));

    // The next request carries the choice.
    await apiGet('/lawyers', LawyersResponse);
    const last = stub.calls[stub.calls.length - 1]!;
    expect(last.headers.get('X-Lawyer-Id')).toBe(SENIOR.id);
  });

  it('documents-list AC-13: sends no X-Lawyer-Id before a lawyer is chosen', async () => {
    const stub = stubFetch({ '/api/lawyers': okReply(lawyersBody()) });

    renderWithClient(<LawyerPicker />);
    await screen.findByRole('combobox', { name: LABEL });

    expect(getCurrentLawyerId()).toBeNull();
    await apiGet('/lawyers', LawyersResponse);
    expect(stub.calls.every((call) => call.headers.get('X-Lawyer-Id') === null)).toBe(true);
  });
});
