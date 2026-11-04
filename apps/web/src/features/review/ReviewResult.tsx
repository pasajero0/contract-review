import type { CompletedReview, Finding } from '@lex-poc/contract/documents';
import { Badge } from '@/ui/badge';
import { formatDateTime } from '@/ui/format';

type Props = {
  review: CompletedReview;
  /** "Previous" while a newer review runs or failed, so an old result is never read as the latest. */
  label: 'Review result' | 'Previous review';
  timeZone: string;
  /** True when a newer version of the document exists. */
  outdated: boolean;
};

const SEVERITY_VARIANT = { high: 'destructive', medium: 'secondary', low: 'outline' } as const;

function FindingItem({ finding }: { finding: Finding }) {
  return (
    <li className="space-y-1 rounded-md border p-2">
      <p>
        <Badge variant={SEVERITY_VARIANT[finding.severity]}>{finding.severity}</Badge>{' '}
        <span className="text-sm">{finding.clause ?? 'Not in the contract'}</span>
      </p>
      <p className="font-medium">{finding.title}</p>
      {finding.excerpt !== null && <blockquote className="border-l-2 pl-2 text-sm">{finding.excerpt}</blockquote>}
      <p className="text-sm">{finding.explanation}</p>
    </li>
  );
}

/** The last completed review with its findings, in the order the API gives. */
export function ReviewResult({ review, label, timeZone, outdated }: Props) {
  const { high, medium, low } = review.counts;
  return (
    <section role="region" aria-label={label} className="space-y-2 rounded-lg border p-3">
      <p>{`${label} · ${formatDateTime(review.requestedAt, timeZone)} · requested by ${review.requestedBy}`}</p>
      {outdated && <Badge variant="outline">review of an outdated version</Badge>}
      <p className="text-sm">{`${high} high · ${medium} medium · ${low} low`}</p>
      {review.findings.length === 0 ? (
        <p>Reviewed — no issues flagged.</p>
      ) : (
        <ul className="space-y-2">
          {review.findings.map((f, i) => (
            <FindingItem key={i} finding={f} />
          ))}
        </ul>
      )}
    </section>
  );
}
