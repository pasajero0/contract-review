'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DocumentResponse, getDocument } from '@lex-poc/contract/documents';
import { QuotaResponse } from '@lex-poc/contract/quota';
import { RequestReviewResponse, requestReview } from '@lex-poc/contract/reviews';
import { apiGet, apiPost } from '@/api/client';
import { getCurrentLawyerId, subscribeToLawyerId } from '@/api/lawyer';
import { queryKeys } from '@/api/queryKeys';
import { Alert } from '@/ui/alert';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/ui/button';
import { formatShortDayMonth } from '@/ui/format';
import { RequestControls } from './RequestControls';
import { ReviewResult } from './ReviewResult';
import { failureText, progressLine, reasonFromError, type Disallowed } from './reviewText';

const POLL_MS = 1500;

type Rejection = { reason: Disallowed; atServerTime: number };

function ErrorAlert({ children, onRetry }: { children: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      {children}{' '}
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </Alert>
  );
}

export function ReviewPanel({ documentId }: { documentId: string }) {
  const queryClient = useQueryClient();
  const id = encodeURIComponent(documentId);
  const lawyerChosen = useSyncExternalStore(
    subscribeToLawyerId,
    () => getCurrentLawyerId() !== null,
    () => false,
  );
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const docQuery = useQuery({
    queryKey: queryKeys.document(documentId),
    queryFn: () => apiGet(getDocument.path.replace(':id', id), DocumentResponse),
    refetchInterval: (q) => (q.state.data?.current ? POLL_MS : false),
  });
  const quotaQuery = useQuery({
    queryKey: queryKeys.quota,
    queryFn: () => apiGet('/quota', QuotaResponse),
  });
  const doc = docQuery.data;
  const quota = quotaQuery.data;

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.document(documentId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.documents });
    void queryClient.invalidateQueries({ queryKey: queryKeys.quota });
  };

  // When a run ends, the list and the plan line change too. The document was just read.
  const wasRunning = useRef(false);
  const isRunning = doc !== undefined && doc.current !== null;
  useEffect(() => {
    if (wasRunning.current && !isRunning) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents });
      void queryClient.invalidateQueries({ queryKey: queryKeys.quota });
    }
    wasRunning.current = isRunning;
  }, [isRunning, queryClient]);

  const limit = quota?.limit ?? 0;
  const request = useMutation({
    mutationFn: async () => {
      const result = await apiPost(requestReview.path.replace(':id', id), RequestReviewResponse);
      if (result.ok) return { rejected: null };
      const reason = reasonFromError(result.error, limit);
      if (reason === null) throw new Error(`Request refused: ${result.error.code}`);
      return { rejected: reason };
    },
    onSuccess: ({ rejected }) => {
      if (rejected) {
        const served = queryClient.getQueryData<DocumentResponse>(queryKeys.document(documentId));
        setRejection({ reason: rejected, atServerTime: served?.serverTime ?? 0 });
        // The page was stale: read it again so it shows what the server knows.
        void queryClient.invalidateQueries({ queryKey: queryKeys.document(documentId) });
      } else {
        refreshAll();
      }
    },
  });

  const retryLoad = () => {
    if (docQuery.isError) void docQuery.refetch();
    if (quotaQuery.isError) void quotaQuery.refetch();
  };
  const loadFailed = docQuery.isError || quotaQuery.isError;

  if (!doc || !quota) {
    return loadFailed ? (
      <ErrorAlert onRetry={retryLoad}>Could not load the document.</ErrorAlert>
    ) : (
      <p>Loading…</p>
    );
  }

  // A rejection counts only until the page is read again: then the page's own answer wins.
  const rejected = rejection && rejection.atServerTime === doc.serverTime && doc.canRequest.allowed;
  const canRequest = rejected ? rejection.reason : doc.canRequest;
  const failed = doc.current === null ? doc.lastFailed : null;
  const resultLabel = doc.current ? 'Previous review' : failed ? 'Earlier result' : 'Review result';

  const requestErrorShown = request.isError && canRequest.allowed && lawyerChosen;

  const controls = (
    <RequestControls
      canRequest={canRequest}
      lawyerChosen={lawyerChosen}
      label={failed ? 'Retry' : 'Request review'}
      hideButton={requestErrorShown}
      pending={request.isPending}
      timeZone={quota.timeZone}
      confirmOpen={confirmOpen}
      onConfirmOpenChange={setConfirmOpen}
      onConfirm={() => {
        setRejection(null);
        request.mutate();
      }}
    />
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{doc.title}</h1>
      {loadFailed && <ErrorAlert onRetry={retryLoad}>Could not refresh. Showing the last data.</ErrorAlert>}

      {doc.current && <p>{progressLine(doc.current, doc.serverTime)}</p>}
      {failed ? (
        <Alert variant="destructive">
          <TriangleAlert />
          <div className="space-y-2">
            <p>{failureText(failed, quota.timeZone)}</p>
            {controls}
          </div>
        </Alert>
      ) : (
        controls
      )}
      {requestErrorShown && (
        <ErrorAlert onRetry={() => setConfirmOpen(true)}>Could not send the request.</ErrorAlert>
      )}

      {doc.current && doc.latestCompleted && (
        <Alert role="status">A new review is running. The result below is from an earlier review.</Alert>
      )}
      {doc.supersededBy && (
        <Alert role="status">
          {`This version was replaced by the version of ${formatShortDayMonth(doc.supersededBy.uploadedAt, quota.timeZone)}. `}
          <Link href={`/documents/${encodeURIComponent(doc.supersededBy.documentId)}`} className="underline">
            Open the newest version
          </Link>
        </Alert>
      )}
      {doc.latestCompleted && (
        <ReviewResult
          review={doc.latestCompleted}
          label={resultLabel}
          timeZone={quota.timeZone}
          outdated={doc.supersededBy !== null}
        />
      )}
    </div>
  );
}
