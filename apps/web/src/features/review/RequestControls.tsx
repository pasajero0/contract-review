'use client';

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
  /** Hides only the button, e.g. while the request error's own Retry is on screen. */
  hideButton: boolean;
  pending: boolean;
  timeZone: string;
  confirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

/** The request button, its confirmation, and the reason when a review cannot be requested. */
export function RequestControls({ canRequest, lawyerChosen, label, hideButton, pending, timeZone, confirmOpen, onConfirmOpenChange, onConfirm }: Props) {
  if (!canRequest.allowed && canRequest.reason === 'document_superseded') {
    return <p>{reasonText(canRequest, timeZone)}</p>;
  }

  return (
    <div className="space-y-2">
      {!hideButton && (
        <Button disabled={!lawyerChosen || !canRequest.allowed || pending} onClick={() => onConfirmOpenChange(true)}>
          {label}
        </Button>
      )}
      {!lawyerChosen && <p>Choose who you are first</p>}
      {!canRequest.allowed && <p>{reasonText(canRequest, timeZone)}</p>}

      <AlertDialog open={confirmOpen} onOpenChange={onConfirmOpenChange}>
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
