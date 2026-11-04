'use client';

import { useState } from 'react';
import { requestReview, type RequestReviewResult } from '@/api/reviews';
import { Button } from '@/ui/button';

// POC only: one document and one lawyer from the samples. The real solution picks both in the UI.
const DOCUMENT_ID = '639fb780-cfdf-4393-bf6e-6a330940b21e';
const LAWYER_ID = '7c1f3d2a-9b64-4e0f-8a21-5d3e6f7a8b90';

export function RequestReviewButton() {
  const [result, setResult] = useState<RequestReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    try {
      setResult(await requestReview(DOCUMENT_ID, LAWYER_ID));
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : 'Request failed');
    }
  }

  return (
    <div>
      <Button onClick={onClick}>Request review</Button>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
