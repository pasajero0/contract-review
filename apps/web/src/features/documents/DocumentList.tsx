'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { DocumentsResponse, type DocumentListItem } from '@lex-poc/contract/documents';
import { QuotaResponse } from '@lex-poc/contract/quota';
import { apiGet } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { Alert } from '@/ui/alert';
import { Badge } from '@/ui/badge';
import { Button } from '@/ui/button';
import { findingCount, formatDateTime } from '@/ui/format';

const POLL_MS = 1500;

const FAILURE_TEXT = { timeout: 'Review timed out', ai_error: 'Review failed: AI error' } as const;

type Summary = { findingsCount: number; highCount: number };

function SummaryText({ summary }: { summary: Summary }) {
  if (summary.findingsCount === 0) return <span>completed, no issues flagged</span>;
  return <span>{`${findingCount(summary.findingsCount)}, ${summary.highCount} high`}</span>;
}

function RequestedLine({ by, at, timeZone }: { by: string; at: number; timeZone: string }) {
  return <span>{`requested by ${by} on ${formatDateTime(at, timeZone)}`}</span>;
}

function StateView({
  state,
  serverTime,
  timeZone,
}: {
  state: DocumentListItem['state'];
  serverTime: number;
  timeZone: string;
}) {
  switch (state.kind) {
    case 'not_reviewed':
      return <span>not reviewed</span>;
    case 'in_progress': {
      const elapsed = Math.floor((serverTime - state.requestedAt) / 1000);
      const total = Math.round((state.deadlineAt - state.requestedAt) / 1000);
      return (
        <div>
          <Badge>in progress</Badge> <span>{`${findingCount(state.findingsCount)} so far`}</span>{' '}
          <span>{`${elapsed} s of ${total}`}</span> <RequestedLine by={state.requestedBy} at={state.requestedAt} timeZone={timeZone} />
        </div>
      );
    }
    case 'completed':
      return (
        <div>
          <SummaryText summary={state} /> <RequestedLine by={state.requestedBy} at={state.requestedAt} timeZone={timeZone} />
        </div>
      );
    case 'failed':
      return (
        <div>
          <div>
            <Badge variant="destructive">{FAILURE_TEXT[state.failureReason]}</Badge>{' '}
            <RequestedLine by={state.requestedBy} at={state.requestedAt} timeZone={timeZone} />
          </div>
          {state.latestCompleted && (
            <div>
              <span>Earlier result:</span> <SummaryText summary={state.latestCompleted} />{' '}
              <RequestedLine by={state.latestCompleted.requestedBy} at={state.latestCompleted.requestedAt} timeZone={timeZone} />
            </div>
          )}
        </div>
      );
  }
}

export function DocumentList() {
  const query = useQuery({
    queryKey: queryKeys.documents,
    queryFn: () => apiGet('/documents', DocumentsResponse),
    refetchInterval: (q) =>
      q.state.data?.documents.some((d) => d.state.kind === 'in_progress') ? POLL_MS : false,
  });

  const quotaQuery = useQuery({
    queryKey: queryKeys.quota,
    queryFn: () => apiGet('/quota', QuotaResponse),
  });

  // A failed refresh of the quota alone, once loaded, keeps the list.
  if (query.isError || (quotaQuery.isError && !quotaQuery.data)) {
    const retry = () => {
      if (query.isError) void query.refetch();
      if (quotaQuery.isError) void quotaQuery.refetch();
    };
    return (
      <Alert variant="destructive">
        Could not load the documents.{' '}
        <Button variant="outline" size="sm" onClick={retry}>
          Retry
        </Button>
      </Alert>
    );
  }
  if (!query.data || !quotaQuery.data) return <p>Loading…</p>;

  const { documents, serverTime } = query.data;
  const { timeZone } = quotaQuery.data;
  return (
    <ul className="space-y-2">
      {documents.map((doc) => (
        <li key={doc.documentId} className="rounded-lg border p-3">
          <Link href={`/documents/${doc.documentId}`} className="font-medium underline">
            {doc.title}
          </Link>{' '}
          {doc.supersededBy && <Badge variant="secondary">Read-only</Badge>}
          <div className="text-sm">
            <StateView state={doc.state} serverTime={serverTime} timeZone={timeZone} />
          </div>
        </li>
      ))}
    </ul>
  );
}
