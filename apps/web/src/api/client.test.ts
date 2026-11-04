// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { QuotaResponse } from '@lex-poc/contract/quota';
import { networkError, okReply, quotaBody, rawReply, stubFetch } from '@/test-helpers';
import { apiGet } from '@/api/client';

describe('apiGet', () => {
  it('documents-list AC-22: returns a valid body parsed with the given schema (ADR-0016)', async () => {
    const stub = stubFetch({ '/api/quota': okReply(quotaBody()) });

    const result = await apiGet('/quota', QuotaResponse);

    expect(result).toEqual(quotaBody());
    expect(stub.count('/api/quota')).toBe(1);
  });

  it('documents-list AC-22: rejects a 200 body with a field of the wrong type (ADR-0016)', async () => {
    stubFetch({ '/api/quota': okReply({ ...quotaBody(), used: '4' }) });

    await expect(apiGet('/quota', QuotaResponse)).rejects.toThrow();
  });

  it('documents-list AC-22: rejects a bad status and a network error', async () => {
    stubFetch({ '/api/quota': rawReply(500, { message: 'boom' }) });
    await expect(apiGet('/quota', QuotaResponse)).rejects.toThrow();

    stubFetch({ '/api/quota': networkError() });
    await expect(apiGet('/quota', QuotaResponse)).rejects.toThrow();
  });
});
