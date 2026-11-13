/**
 * A step still to take after a command succeeded, beside the control that sent it, in the warn tone: a word for what happened and what
 * waits, one sentence, the control that takes the step, and a dismiss button. It is a status, so it is read out without interrupting.
 */
import type { ReactNode } from 'react';

import { Button } from './Button.tsx';

export interface PendingStepProps {
  /** What happened and what waits, such as "Updated; restart pending." */
  readonly word:         string;
  readonly sentence:     string;
  /** The control that takes the pending step. */
  readonly action:       ReactNode;
  readonly dismissLabel: string;
  readonly onDismiss:    () => void;
}

export function PendingStep({
  word, sentence, action, dismissLabel, onDismiss
}: PendingStepProps) {
  return (
    <div className="gaia-pending-step" role="status">
      <span className="gaia-pending-step-text">
        <span className="gaia-pending-step-word">{word}</span>
        {` ${sentence}`}
      </span>
      {action}
      <Button label={dismissLabel} icon="dismiss" iconOnly onPress={onDismiss} />
    </div>
  );
}
