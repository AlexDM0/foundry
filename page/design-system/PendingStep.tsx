/**
 * A step still to take after a command succeeded, beside the control that sent it: a dashed orange card with a solid left edge, its word
 * for what happened and what waits in orange, one sentence, the control that takes the step, and a named dismiss button. It is a status,
 * so it is read out without interrupting.
 */
import { IconButton }     from 'design-system/IconButton';
import type { ReactNode } from 'react';


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
      <IconButton glyph="close" accessibleName={dismissLabel} title={dismissLabel} onPress={onDismiss} />
    </div>
  );
}
