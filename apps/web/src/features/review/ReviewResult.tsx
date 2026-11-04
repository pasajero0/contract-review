import type { CompletedReview } from '@lex-poc/contract/documents';
import { formatDateTime } from '@/ui/format';

type Props = {
  review: CompletedReview;
  /** "Previous" while a newer review runs or failed, so an old result is never read as the latest. */
  label: 'Previous review' | 'Latest review';
  timeZone: string;
};

/** The last completed review as a separate block. Finding content is the next stage. */
export function EarlierReview({ review, label, timeZone }: Props) {
  const { high, medium, low } = review.counts;
  return (
    <section role="region" aria-label={label} className="rounded-lg border p-3">
      <p>{`${label} · ${formatDateTime(review.requestedAt, timeZone)} · requested by ${review.requestedBy}`}</p>
      <p className="text-sm">{`${high} high · ${medium} medium · ${low} low`}</p>
    </section>
  );
}
