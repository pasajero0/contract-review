'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ReviewPanel } from '@/features/review/ReviewPanel';

export default function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="space-y-4">
      <Link href="/" className="underline">
        ← All documents
      </Link>
      <ReviewPanel documentId={id} />
    </div>
  );
}
