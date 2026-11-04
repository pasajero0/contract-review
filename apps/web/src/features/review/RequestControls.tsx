'use client';

import { useState } from 'react';
import type { CanRequest } from '@lex-poc/contract/documents';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/ui/alert-dialog';
import { Button } from '@/ui/button';
import { reasonText } from './reviewText';

type Props = {
  canRequest: CanRequest;
  lawyerChosen: boolean;
  label: 'Request review' | 'Retry';
  pending: boolean;
  timeZone: string;
  onConfirm: () => void;
};

/** The request button, its confirmation, and the reason when a review cannot be requested. */
export function RequestControls({ canRequest, lawyerChosen, label, pending, timeZone, onConfirm }: Props) {
  const [open, setOpen] = useState(false);

  if (!canRequest.allowed && canRequest.reason === 'document_superseded') {
    return <p>{reasonText(canRequest, timeZone)}</p>;
  }

  return (
    <div className="space-y-2">
      <Button disabled={!lawyerChosen || !canRequest.allowed || pending} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {!lawyerChosen && <p>Choose who you are first</p>}
      {!canRequest.allowed && <p>{reasonText(canRequest, timeZone)}</p>}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request a review?</AlertDialogTitle>
            <AlertDialogDescription>
              {canRequest.allowed && canRequest.remaining === 1
                ? 'This is the last review available this month.'
                : `This uses 1 of your ${canRequest.allowed ? canRequest.remaining : 0} remaining reviews — only if it completes.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
