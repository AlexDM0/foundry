/**
 * An action that failed, beside the control that sent it, as text in the failure ink: an optional lead, an optional code in mono that ends
 * its own sentence, then the failure's sentence; after it a compact retry button and a named dismiss button, each only when given. Never a
 * red button. It is an alert, so it is read out when it appears.
 */
import { Button }     from 'design-system/Button';
import { IconButton } from 'design-system/IconButton';

/** A retry needs both its label and its action, or neither. */
type RetryProps = { readonly retryLabel: string; readonly onRetry: () => void } | { readonly retryLabel?: never; readonly onRetry?: never };

/** A dismissal needs both its name and its action, or neither. */
type DismissProps = { readonly dismissLabel: string; readonly onDismiss: () => void } | { readonly dismissLabel?: never; readonly onDismiss?: never };

export type FailedActionProps = RetryProps & DismissProps & {
  /** Words before the code, such as the name of what failed. */
  readonly lead?:    string;
  /** A machine word for the failure, set in mono. */
  readonly code?:    string;
  readonly sentence: string;
};

export function FailedAction({
  lead, code, sentence, retryLabel, onRetry, dismissLabel, onDismiss
}: FailedActionProps) {
  return (
    <div className="design-system-failed-action" role="alert">
      <span className="design-system-failed-action-text">
        {lead}
        {code === undefined ? null : <span className="design-system-failed-action-code">{code}</span>}
        {code === undefined ? sentence : `. ${sentence}`}
      </span>
      {retryLabel === undefined || onRetry === undefined ? null : <Button label={retryLabel} compact onPress={onRetry} />}
      {dismissLabel === undefined || onDismiss === undefined ? null : <IconButton glyph="close" accessibleName={dismissLabel} title={dismissLabel} onPress={onDismiss} />}
    </div>
  );
}
