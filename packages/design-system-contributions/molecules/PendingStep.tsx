/**
 * A step still to take after an action succeeded, beside the control that sent it: a dashed card in the accent edge with a solid left edge,
 * its word for what happened and what waits in the accent ink, one sentence, the control that takes the step, and a named dismiss button.
 * Under a box that already draws the solid edge, `edgeless` dashes it all round. It is a status, so it is read out without interrupting.
 */
import { IconButton }     from 'design-system/IconButton';
import type { ReactNode } from 'react';

export interface PendingStepProps {
  /** What happened and what waits, such as "Saved; publish pending." */
  readonly word:         string;
  readonly sentence:     string;
  readonly dismissLabel: string;
  readonly onDismiss:    () => void;
  /** The control that takes the pending step. */
  readonly action?:      ReactNode;
  readonly edgeless?:    boolean;
}

export function PendingStep({
  word, sentence, dismissLabel, onDismiss, action, edgeless
}: PendingStepProps) {
  return (
    <div className="design-system-pending-step" role="status" data-edgeless={edgeless === true ? '' : undefined}>
      <span className="design-system-pending-step-text">
        <span className="design-system-pending-step-word">{word}</span>
        {` ${sentence}`}
      </span>
      {action}
      <IconButton glyph="close" accessibleName={dismissLabel} title={dismissLabel} onPress={onDismiss} />
    </div>
  );
}
