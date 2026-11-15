/**
 * A refusal beside the control that caused it, in Gaia's words around the package's failed action: who refused, the code in mono and the
 * sentence Gaia's server answered for it, unedited here, then a compact "Try again" when the command can be sent again, and a named dismiss
 * button. Never a red button. It is an alert, so it is read out when it appears.
 */
import { FailedAction } from 'design-system-contributions/FailedAction';

/** `gaia` when Gaia itself refused or nothing answered, so the refusal never blames a forge that was not asked. */
export type RefusedBy = 'forge' | 'gaia';

export interface RefusalProps {
  /** The refused command's own button label, such as "Stop". */
  readonly commandLabel: string;
  readonly refusedBy:    RefusedBy;
  readonly code:         string;
  readonly sentence:     string;
  readonly onDismiss:    () => void;
  readonly onTryAgain?:  () => void;
}

const DISMISS_LABEL = 'Dismiss this refusal';

const TRY_AGAIN_LABEL = 'Try again';

function leadInOf(refusedBy: RefusedBy, commandLabel: string): string {
  return refusedBy === 'forge' ? `The forge refused ${commandLabel}: ` : `Gaia could not ${commandLabel}: `;
}

export function Refusal({
  commandLabel, refusedBy, code, sentence, onDismiss, onTryAgain
}: RefusalProps) {
  return (
    <FailedAction
      lead={leadInOf(refusedBy, commandLabel)}
      code={code}
      sentence={sentence}
      dismissLabel={DISMISS_LABEL}
      onDismiss={onDismiss}
      {...(onTryAgain === undefined ? {} : { retryLabel: TRY_AGAIN_LABEL, onRetry: onTryAgain })}
    />
  );
}
