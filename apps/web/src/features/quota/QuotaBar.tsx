'use client';

import { useQuery } from '@tanstack/react-query';
import { QuotaResponse } from '@lex-poc/contract/quota';
import { apiGet } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { Alert } from '@/ui/alert';
import { Button } from '@/ui/button';
import { formatDayMonth } from '@/ui/format';

const POLL_MS = 1500;

export function QuotaBar() {
  const query = useQuery({
    queryKey: queryKeys.quota,
    queryFn: () => apiGet('/quota', QuotaResponse),
    refetchInterval: (q) => ((q.state.data?.running ?? 0) > 0 ? POLL_MS : false),
  });

  if (query.isError) {
    return (
      <Alert variant="destructive">
        Could not load the plan usage.{' '}
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </Alert>
    );
  }
  if (!query.data) return <span>Loading…</span>;

  const { used, limit, running, resetsAt, timeZone } = query.data;
  return (
    <span>{`Used ${used} of ${limit} · ${running} running · resets on ${formatDayMonth(resetsAt, timeZone)}`}</span>
  );
}
